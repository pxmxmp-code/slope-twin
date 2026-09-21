import math
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    (tmp_path / "tileset.json").write_text('{"asset":{"version":"1.1"}}')
    (tmp_path / "sample.glb").write_bytes(b"glTF" + bytes(32))
    return Settings(_env_file=None, tiles_directory=str(tmp_path),
                    database_url="", mapbox_token="public-test-token")


def test_public_config_excludes_private_settings(settings):
    settings.database_url = "postgresql://private:secret@localhost/test"
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/config")
        assert response.status_code == 200
        assert response.json()["mapboxToken"] == "public-test-token"
        assert "secret" not in response.text
        assert "geoserver" not in response.text.lower()


def test_model_static_range_and_boundary(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/tiles/tileset.json").status_code == 200
        response = client.get("/tiles/sample.glb", headers={"Range": "bytes=0-3"})
        assert response.status_code == 206
        assert response.content == b"glTF"
        assert client.get("/tiles/%2e%2e/.env").status_code == 404
        assert client.get("/tiles/missing.glb").status_code == 404
        assert client.get("/api/health").json()["database"] == "not_configured"


def test_dom_requests_web_mercator(settings):
    seen = []

    def upstream(request):
        seen.append(request)
        return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nfixture")

    app = create_app(settings)
    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        response = client.get("/api/dom/0/0/0.png")
        assert response.status_code == 200
        params = seen[0].url.params
        assert params["srs"] == "EPSG:3857"
        assert params["layers"] == settings.geoserver_dom_layer
        assert params["format"] == "image/png"
        half = math.pi * 6378137
        assert list(map(float, params["bbox"].split(","))) == [-half, -half, half, half]
        assert client.get("/api/dom/2/4/0.png").status_code == 400
        assert client.get("/api/dom/23/0/0.png").status_code == 400
        app.state.http = original


@pytest.mark.parametrize("upstream_status,body", [(200, b"<ServiceException/>"), (503, b"offline")])
def test_geoserver_errors_are_not_served_as_images(settings, upstream_status, body):
    app = create_app(settings)
    with TestClient(app) as client:
        original = app.state.http
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(upstream_status, content=body)))
        response = client.get("/api/dom/0/0/0.png")
        assert response.status_code == 502
        assert response.headers["content-type"].startswith("application/json")
        app.state.http = original
