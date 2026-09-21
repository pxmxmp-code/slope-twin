import math
from contextlib import asynccontextmanager

import httpx
import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
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
    app.mount("/tiles", StaticFiles(directory=settings.tiles_path, check_dir=False), name="tiles")

    @app.get("/api/config")
    async def config():
        # 严格白名单：数据库凭据与 GeoServer 内网地址不发送给浏览器。
        return {
            "mapboxToken": settings.mapbox_token,
            "tiandituToken": settings.tianditu_token,
            "bounds": settings.dom_bounds,
            "domTiles": "/api/dom/{z}/{x}/{y}.png",
            "tilesetUrl": "/tiles/tileset.json",
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
        return {"api": "ok", "database": database,
                "tileset": "ok" if (settings.tiles_path / "tileset.json").is_file() else "missing"}

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
