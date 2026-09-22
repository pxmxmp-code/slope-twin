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
def settings():
    return Settings(
        _env_file=None,
        database_url="",
        mapbox_token="public-test-token",
        minio_endpoint="http://objects.test",
        minio_bucket="slope-twin",
    )


def use_mock_http(app, handler):
    original = app.state.infrastructure.http
    app.state.infrastructure.http = httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )
    return original


def test_public_config_excludes_private_settings(settings):
    settings.database_url = "postgresql://private:secret@localhost/test"
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["mapboxToken"] == "public-test-token"
    assert response.json()["tilesetUrl"] == "/tiles/tileset.json"
    assert "secret" not in response.text
    assert "geoserver" not in response.text.lower()


def test_tiles_are_streamed_from_object_storage(settings):
    seen: list[httpx.Request] = []

    def upstream(request: httpx.Request):
        seen.append(request)
        if request.url.path.endswith("tileset.json"):
            return httpx.Response(200, json={"asset": {"version": "1.1"}})
        if request.url.path.endswith("tile.b3dm"):
            return httpx.Response(
                206,
                content=b"b3dm",
                headers={
                    "content-type": "application/octet-stream",
                    "content-range": "bytes 0-3/4",
                },
            )
        return httpx.Response(404)

    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(app, upstream)
        assert client.get("/tiles/tileset.json").status_code == 200
        response = client.get("/tiles/tile.b3dm", headers={"Range": "bytes=0-3"})
        assert response.status_code == 206
        assert response.content == b"b3dm"
        assert client.get("/tiles/%2e%2e/.env").status_code == 404
        assert client.get("/tiles/missing.glb").status_code == 404
        app.state.infrastructure.http = original

    assert seen[0].url == "http://objects.test/slope-twin/tiles/tileset.json"
    assert seen[1].headers["range"] == "bytes=0-3"


def test_health_checks_remote_object_storage(settings):
    def upstream(request: httpx.Request):
        return httpx.Response(
            200 if request.url.path.endswith("tiles/tileset.json") else 404
        )

    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(app, upstream)
        response = client.get("/api/health")
        app.state.infrastructure.http = original

    assert response.json() == {
        "api": "ok",
        "database": "not_configured",
        "tileset": "ok",
    }


def test_dom_requests_web_mercator(settings):
    seen: list[httpx.Request] = []

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nfixture")

    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(app, upstream)
        response = client.get("/api/dom/0/0/0.png")
        assert client.get("/api/dom/2/4/0.png").status_code == 400
        assert client.get("/api/dom/23/0/0.png").status_code == 400
        app.state.infrastructure.http = original

    assert response.status_code == 200
    params = seen[0].url.params
    assert params["srs"] == "EPSG:3857"
    assert params["layers"] == settings.geoserver_dom_layer
    half = math.pi * 6378137
    assert list(map(float, params["bbox"].split(","))) == [
        -half,
        -half,
        half,
        half,
    ]


@pytest.mark.parametrize(
    "upstream_status,body", [(200, b"<ServiceException/>"), (503, b"offline")]
)
def test_geoserver_errors_are_not_served_as_images(
    settings, upstream_status, body
):
    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(
            app,
            lambda request: httpx.Response(upstream_status, content=body),
        )
        response = client.get("/api/dom/0/0/0.png")
        app.state.infrastructure.http = original

    assert response.status_code == 502
    assert response.headers["content-type"].startswith("application/json")


def test_features_require_database(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/features/jmd").status_code == 503
