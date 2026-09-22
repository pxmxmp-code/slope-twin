import asyncio
from html.parser import HTMLParser
import math
import re
from urllib.parse import quote
from urllib.parse import parse_qsl, urlsplit, urlunsplit

import httpx
import psycopg
from fastapi import HTTPException

from .config import Settings


class FeatureInfoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs):
        if tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = []

    def handle_data(self, data: str):
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str):
        if tag == "td" and self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None

    def feature_collection(self) -> dict[str, object]:
        if len(self.rows) < 2:
            return {"type": "FeatureCollection", "features": []}
        fields, *values = self.rows
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": dict(zip(fields, row, strict=False)),
                }
                for row in values
            ],
        }


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

    def __init__(
        self,
        settings: Settings,
        http: httpx.AsyncClient,
        geocloud_http: httpx.AsyncClient,
    ):
        self.settings = settings
        self.http = http
        self.geocloud_http = geocloud_http

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

    async def _geocloud_get(
        self, params: dict[str, object], token: str | None = None
    ) -> httpx.Response:
        if not self.settings.geocloud_wms_url:
            raise HTTPException(503, "地质云 WMS 未配置")
        parsed = urlsplit(self.settings.geocloud_wms_url)
        url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
        credentials = parse_qsl(parsed.query, keep_blank_values=True)
        if token:
            if len(token) > 4096 or not re.fullmatch(r"[A-Za-z0-9._-]{20,}", token):
                raise HTTPException(422, "无效的地质云令牌")
            credentials = [
                (key, value) for key, value in credentials if key.lower() != "tk"
            ]
            credentials.append(("tk", token))
        # MapGIS rejects the token when WMS parameters are appended after it.
        query = [*params.items(), *credentials]
        try:
            response = await self.geocloud_http.get(url, params=query)
            response.raise_for_status()
            return response
        except httpx.HTTPError as error:
            raise HTTPException(502, "地质云 WMS 服务不可用") from error

    def _geocloud_params(self, request: str, bbox: tuple[float, ...]) -> dict[str, object]:
        return {
            "SERVICE": "WMS",
            "VERSION": "1.1.1",
            "REQUEST": request,
            "LAYERS": self.settings.geocloud_wms_layers,
            "STYLES": "",
            "SRS": "EPSG:3857",
            "BBOX": ",".join(map(str, bbox)),
        }

    async def geology_png(
        self, z: int, x: int, y: int, token: str | None = None
    ) -> bytes:
        params = self._geocloud_params("GetMap", mercator_bbox(z, x, y))
        params.update(
            WIDTH=256,
            HEIGHT=256,
            FORMAT="image/png",
            TRANSPARENT="TRUE",
        )
        response = await self._geocloud_get(params, token)
        if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(502, "地质云未返回地图图像，令牌可能已失效")
        return response.content

    async def geology_info(
        self,
        bbox: tuple[float, float, float, float],
        width: int,
        height: int,
        x: int,
        y: int,
        token: str | None = None,
    ) -> object:
        params = self._geocloud_params("GetFeatureInfo", bbox)
        query_layer = self.settings.geocloud_wms_layers.split(",", 1)[0].strip()
        params.update(
            LAYERS=query_layer,
            QUERY_LAYERS=query_layer,
            SRS="EPSG:4326",
            WIDTH=width,
            HEIGHT=height,
            X=x,
            Y=y,
            FORMAT="image/png",
            INFO_FORMAT="text/html",
            FEATURE_COUNT=10,
        )
        response = await self._geocloud_get(params, token)
        parser = FeatureInfoParser()
        parser.feed(response.text)
        return parser.feature_collection()

    async def contours(self, interval: int) -> dict[str, object]:
        try:
            response = await self.http.get(
                self.settings.geoserver_wfs_url,
                params={
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": self.settings.geoserver_contour_layer,
                    "outputFormat": "application/json",
                    "srsName": "EPSG:4326",
                    "CQL_FILTER": (
                        f"elevation/{interval}=floor(elevation/{interval})"
                    ),
                },
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(502, "等高线服务不可用，请检查 GeoServer") from error

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
