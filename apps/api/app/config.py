from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings shared by local development and deployment."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mapbox_token: str = ""
    tianditu_token: str = ""
    dom_bounds: tuple[float, float, float, float] = (
        98.87636822220345,
        27.04721825778342,
        98.8879329074003,
        27.05324393689146,
    )

    database_url: str = ""
    geoserver_wms_url: str = "http://192.168.1.110:8080/geoserver/ne/wms"
    geoserver_wfs_url: str = "http://192.168.1.110:8080/geoserver/ne/wfs"
    geoserver_dom_layer: str = "ne:DOM_COG"
    geoserver_contour_layer: str = "ne:majiadi_contours"
    geocloud_wms_url: str = ""
    geocloud_wms_layers: str = ",".join(f"t{i}" for i in range(13))
    minio_endpoint: str = "http://192.168.1.110:29000"
    minio_bucket: str = "slope-twin"

    @field_validator("dom_bounds")
    @classmethod
    def validate_bounds(cls, bounds: tuple[float, float, float, float]):
        west, south, east, north = bounds
        if not (
            -180 <= west < east <= 180
            and -85.051129 <= south < north <= 85.051129
        ):
            raise ValueError("DOM_BOUNDS 必须是有效的西、南、东、北经纬度")
        return bounds

    def public_config(self) -> dict[str, object]:
        return {
            "mapboxToken": self.mapbox_token,
            "tiandituToken": self.tianditu_token,
            "bounds": self.dom_bounds,
            "domTiles": "/api/dom/{z}/{x}/{y}.png",
            "tilesetUrl": "/tiles/tileset.json",
            "terrainUrl": "/tiles/terrain/",
            "geologyAvailable": bool(self.geocloud_wms_url),
        }
