import math
from contextlib import asynccontextmanager

import httpx
import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings


def mercator_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(400, "无效的瓦片坐标")
    half = math.pi * 6378137
    step = 2 * half / 2**z
    return (-half + x * step, half - (y + 1) * step,
            -half + (x + 1) * step, half - y * step)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=30, trust_env=False,
                                     limits=httpx.Limits(max_connections=16)) as client:
            app.state.http = client
            yield

    app = FastAPI(title="Slope Twin API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if (settings.tiles_path / "tileset.json").is_file():
        app.mount("/tiles", StaticFiles(directory=settings.tiles_path, check_dir=False), name="tiles")
    else:
        @app.api_route("/tiles/{file_path:path}", methods=["GET", "HEAD"])
        async def proxy_tiles(file_path: str, request: Request):
            if ".." in file_path or file_path.startswith("/"):
                raise HTTPException(404, "无效的文件路径")
            if not settings.minio_endpoint:
                raise HTTPException(404, "瓦片文件未找到且未配置 MinIO")
            minio_url = f"{settings.minio_endpoint.rstrip('/')}/{settings.minio_bucket}/tiles/{file_path}"
            client: httpx.AsyncClient = request.app.state.http
            req_headers = {}
            for h in ("range", "if-none-match", "if-modified-since"):
                if h in request.headers:
                    req_headers[h] = request.headers[h]
            try:
                req = client.build_request(request.method, minio_url, headers=req_headers)
                res = await client.send(req, stream=True)
                if res.status_code >= 400:
                    await res.aclose()
                    raise HTTPException(res.status_code, "瓦片未找到")
                resp_headers = {}
                for h in ("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"):
                    if h in res.headers:
                        resp_headers[h] = res.headers[h]

                async def body_stream():
                    try:
                        async for chunk in res.aiter_bytes():
                            yield chunk
                    finally:
                        await res.aclose()

                return StreamingResponse(
                    body_stream(),
                    status_code=res.status_code,
                    headers=resp_headers,
                )
            except httpx.RequestError as e:
                raise HTTPException(502, f"MinIO 代理失败: {e}")

    @app.get("/api/config")
    async def config():
        # 严格白名单：数据库凭据与 GeoServer 内网地址不发送给浏览器。
        return {
            "mapboxToken": settings.mapbox_token,
            "tiandituToken": settings.tianditu_token,
            "bounds": settings.dom_bounds,
            "domTiles": "/api/dom/{z}/{x}/{y}.png",
            "tilesetUrl": settings.tileset_url or "/tiles/tileset.json",
        }

    @app.get("/api/health")
    async def health(request: Request):
        database = "not_configured"
        if settings.database_url:
            try:
                async with await psycopg.AsyncConnection.connect(
                    settings.database_url, connect_timeout=3
                ) as connection:
                    await connection.execute("SELECT 1")
                database = "ok"
            except psycopg.Error:
                database = "unavailable"

        tileset_ok = (settings.tiles_path / "tileset.json").is_file()
        if not tileset_ok and settings.minio_endpoint and hasattr(request.app.state, "http"):
            try:
                minio_url = f"{settings.minio_endpoint.rstrip('/')}/{settings.minio_bucket}/tiles/tileset.json"
                r = await request.app.state.http.head(minio_url, timeout=3.0)
                tileset_ok = (r.status_code == 200)
            except Exception:
                tileset_ok = False

        return {
            "api": "ok",
            "database": database,
            "tileset": "ok" if tileset_ok else "missing",
        }

    @app.get("/api/features/jmd")
    async def features_jmd():
        if not settings.database_url:
            raise HTTPException(503, "数据库连接未配置")
        try:
            async with await psycopg.AsyncConnection.connect(settings.database_url, connect_timeout=5) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT json_build_object('type', 'FeatureCollection', 'features', "
                        "COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) "
                        "FROM (SELECT id, xm, rs, shape_length, shape_area, ST_Transform(geom, 4326) AS geom FROM jmd) AS t;"
                    )
                    row = await cur.fetchone()
                    return row[0] if row and row[0] else {"type": "FeatureCollection", "features": []}
        except psycopg.Error as error:
            raise HTTPException(502, f"查询要素失败: {error}") from error

    @app.get("/api/dom/{z}/{x}/{y}.png")
    async def dom(z: int, x: int, y: int, request: Request):
        bbox = mercator_bbox(z, x, y)
        try:
            result = await request.app.state.http.get(settings.geoserver_wms_url, params={
                "service": "WMS", "version": "1.1.1", "request": "GetMap",
                "layers": settings.geoserver_dom_layer, "styles": "",
                "srs": "EPSG:3857", "bbox": ",".join(map(str, bbox)),
                "width": "256", "height": "256", "format": "image/png", "transparent": "true",
            })
            result.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(502, "DOM 服务不可用，请检查 GeoServer 地址和运行状态") from error
        if not result.content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(502, "GeoServer 未返回 PNG，请检查图层名称及坐标转换配置")
        return Response(result.content, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=300"})

    return app


app = create_app()
