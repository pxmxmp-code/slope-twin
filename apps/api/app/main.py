from contextlib import asynccontextmanager
from pathlib import PurePosixPath

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
        async with httpx.AsyncClient(
            timeout=30,
            trust_env=False,
            limits=httpx.Limits(max_connections=32),
        ) as http:
            app.state.infrastructure = Infrastructure(settings, http)
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

    @app.get("/api/dom/{z}/{x}/{y}.png")
    async def dom_tile(z: int, x: int, y: int, request: Request):
        content = await infrastructure(request).dom_png(z, x, y)
        return Response(
            content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=300"},
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
