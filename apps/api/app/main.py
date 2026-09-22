from contextlib import asynccontextmanager
from pathlib import PurePosixPath
import ssl

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from .config import Settings
from .infrastructure import Infrastructure


FORWARDED_HEADERS = (
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        geocloud_ssl = ssl.create_default_context()
        geocloud_ssl.options |= ssl.OP_LEGACY_SERVER_CONNECT
        async with httpx.AsyncClient(
            timeout=30,
            trust_env=False,
            limits=httpx.Limits(max_connections=32),
        ) as http, httpx.AsyncClient(
            timeout=45,
            trust_env=False,
            verify=geocloud_ssl,
            limits=httpx.Limits(max_connections=32),
        ) as geocloud_http:
            app.state.infrastructure = Infrastructure(settings, http, geocloud_http)
            yield

    app = FastAPI(title="Slope Twin API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def infrastructure(request: Request) -> Infrastructure:
        return request.app.state.infrastructure

    @app.get("/api/config")
    async def public_config():
        return settings.public_config()

    @app.get("/api/health")
    async def health(request: Request):
        return await infrastructure(request).health()

    @app.get("/api/features/jmd")
    async def jmd_features(request: Request):
        return await infrastructure(request).jmd_features()

    @app.get("/api/features/contours")
    async def contours(
        request: Request,
        interval: int = Query(20),
    ):
        if interval not in {2, 10, 20}:
            raise HTTPException(422, "等高线间距只支持 2、10 或 20 米")
        return await infrastructure(request).contours(interval)

    @app.get("/api/features/model-footprint")
    async def model_footprint(request: Request):
        return await infrastructure(request).model_footprint()

    @app.get("/api/dom/{z}/{x}/{y}.png")
    async def dom_tile(z: int, x: int, y: int, request: Request):
        content = await infrastructure(request).dom_png(z, x, y)
        return Response(
            content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=300"},
        )

    @app.get("/api/geology/{z}/{x}/{y}.png")
    async def geology_tile(z: int, x: int, y: int, request: Request):
        content = await infrastructure(request).geology_png(
            z, x, y, request.headers.get("x-geocloud-token")
        )
        return Response(
            content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=300"},
        )

    @app.get("/api/geology/info")
    async def geology_info(
        request: Request,
        west: float,
        south: float,
        east: float,
        north: float,
        width: int = Query(ge=1, le=4096),
        height: int = Query(ge=1, le=4096),
        x: int = Query(ge=0),
        y: int = Query(ge=0),
    ):
        if not (
            -180 <= west < east <= 180
            and -85.051129 <= south < north <= 85.051129
            and x < width
            and y < height
        ):
            raise HTTPException(422, "无效的地图查询范围或像素坐标")
        return await infrastructure(request).geology_info(
            (west, south, east, north),
            width,
            height,
            x,
            y,
            request.headers.get("x-geocloud-token"),
        )

    @app.api_route("/tiles/{file_path:path}", methods=["GET", "HEAD"])
    async def model_file(file_path: str, request: Request):
        path = PurePosixPath(file_path)
        if not file_path or path.is_absolute() or ".." in path.parts:
            raise HTTPException(404, "无效的文件路径")

        request_headers = {
            name: request.headers[name]
            for name in ("range", "if-none-match", "if-modified-since")
            if name in request.headers
        }
        upstream = await infrastructure(request).open_object(
            request.method, f"tiles/{file_path}", request_headers
        )
        response_headers = {
            name: upstream.headers[name]
            for name in FORWARDED_HEADERS
            if name in upstream.headers
        }

        async def body():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()

        return StreamingResponse(
            body(), status_code=upstream.status_code, headers=response_headers
        )

    return app


app = create_app()
