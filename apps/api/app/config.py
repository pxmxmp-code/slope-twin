from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    mapbox_token: str = ""
    tianditu_token: str = ""
    geoserver_wms_url: str = "http://localhost:8080/geoserver/ne/wms"
    geoserver_dom_layer: str = "ne:DOM_COG"
    dom_bounds: tuple[float, float, float, float] = (
        98.87636822220345, 27.04721825778342, 98.8879329074003, 27.05324393689146
    )
    tiles_directory: str = "data/TILES"
    tileset_url: str = "/tiles/tileset.json"
    minio_endpoint: str = "http://minio:9000"
    minio_bucket: str = "slope-twin"
    database_url: str = ""

    @field_validator("dom_bounds")
    @classmethod
    def validate_bounds(cls, bounds):
        west, south, east, north = bounds
        if not (-180 <= west < east <= 180 and -85.051129 <= south < north <= 85.051129):
            raise ValueError("DOM_BOUNDS 必须是有效的西、南、东、北经纬度")
        return bounds

    @property
    def tiles_path(self) -> Path:
        path = Path(self.tiles_directory)
        if path.is_absolute():
            return path.resolve()
        # 兼容 Docker 镜像 (/app) 与 本地工程根目录
        for parent in (Path(__file__).resolve().parents[2], ROOT):
            candidate = parent / path
            if candidate.exists():
                return candidate.resolve()
        return (ROOT / path).resolve()
