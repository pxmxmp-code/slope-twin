import asyncio
import math
from urllib.parse import quote

import httpx
import psycopg
from fastapi import HTTPException

from .config import Settings


def mercator_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(400, "无效的瓦片坐标")
    half = math.pi * 6378137
    step = 2 * half / 2**z
    return (
        -half + x * step,
        half - (y + 1) * step,
        -half + (x + 1) * step,
        half - y * step,
    )


class Infrastructure:
    """The single seam between the API and infrastructure on 192.168.1.110."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    def object_url(self, path: str) -> str:
        safe_path = quote(path.lstrip("/"), safe="/")
        endpoint = self.settings.minio_endpoint.rstrip("/")
        bucket = quote(self.settings.minio_bucket, safe="")
        return f"{endpoint}/{bucket}/{safe_path}"

    async def health(self) -> dict[str, str]:
        database, tileset = await asyncio.gather(
            self._database_status(), self._object_status("tiles/tileset.json")
        )
        return {"api": "ok", "database": database, "tileset": tileset}

    async def _database_status(self) -> str:
        if not self.settings.database_url:
            return "not_configured"
        try:
            async with await psycopg.AsyncConnection.connect(
                self.settings.database_url, connect_timeout=3
            ) as connection:
                await connection.execute("SELECT 1")
            return "ok"
        except psycopg.Error:
            return "unavailable"

    async def _object_status(self, path: str) -> str:
        try:
            response = await self.http.head(self.object_url(path), timeout=3)
            return "ok" if response.status_code == 200 else "unavailable"
        except httpx.HTTPError:
            return "unavailable"

    async def jmd_features(self) -> dict[str, object]:
        if not self.settings.database_url:
            raise HTTPException(503, "数据库连接未配置")
        try:
            async with await psycopg.AsyncConnection.connect(
                self.settings.database_url, connect_timeout=5
            ) as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        "SELECT json_build_object('type', 'FeatureCollection', "
                        "'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), "
                        "'[]'::json)) FROM (SELECT id, xm, rs, shape_length, "
                        "shape_area, ST_Transform(geom, 4326) AS geom FROM jmd) AS t"
                    )
                    row = await cursor.fetchone()
            return row[0] if row and row[0] else self.empty_features()
        except psycopg.Error as error:
            raise HTTPException(502, f"查询要素失败: {error}") from error

    async def dom_png(self, z: int, x: int, y: int) -> bytes:
        try:
            response = await self.http.get(
                self.settings.geoserver_wms_url,
                params={
                    "service": "WMS",
                    "version": "1.1.1",
                    "request": "GetMap",
                    "layers": self.settings.geoserver_dom_layer,
                    "styles": "",
                    "srs": "EPSG:3857",
                    "bbox": ",".join(map(str, mercator_bbox(z, x, y))),
                    "width": "256",
                    "height": "256",
                    "format": "image/png",
                    "transparent": "true",
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(502, "DOM 服务不可用，请检查 GeoServer") from error
        if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(502, "GeoServer 未返回 PNG，请检查图层配置")
        return response.content

    async def open_object(
        self, method: str, path: str, headers: dict[str, str]
    ) -> httpx.Response:
        try:
            request = self.http.build_request(
                method, self.object_url(path), headers=headers
            )
            response = await self.http.send(request, stream=True)
        except httpx.RequestError as error:
            raise HTTPException(502, "对象存储不可用") from error
        if response.status_code >= 400:
            status = response.status_code
            await response.aclose()
            raise HTTPException(status, "模型文件未找到")
        return response

    @staticmethod
    def empty_features() -> dict[str, object]:
        return {"type": "FeatureCollection", "features": []}
