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


def test_features_unconfigured(settings):
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/api/features/jmd").status_code == 503


def test_minio_tiles_proxy_and_health(tmp_path):
    # 当本地没有 tileset.json 时，测试通过 MinIO 代理请求与健康检查
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    settings = Settings(
        _env_file=None,
        tiles_directory=str(empty_dir),
        database_url="",
        minio_endpoint="http://mock-minio:9000",
        minio_bucket="slope-twin",
    )

    def mock_minio(request: httpx.Request):
        if "tileset.json" in str(request.url):
            return httpx.Response(200, json={"asset": {"version": "1.1"}})
        if "tile.b3dm" in str(request.url):
            return httpx.Response(200, content=b"b3dm_mock_data", headers={"content-type": "application/octet-stream"})
        return httpx.Response(404, text="not found")

    app = create_app(settings)
    with TestClient(app) as client:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(mock_minio))
        # 测试健康检查通过 MinIO 确认 tileset ok
        health_resp = client.get("/api/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["tileset"] == "ok"

        # 测试瓦片代理
        tile_resp = client.get("/tiles/tileset.json")
        assert tile_resp.status_code == 200
        assert "asset" in tile_resp.json()

        b3dm_resp = client.get("/tiles/tile.b3dm")
        assert b3dm_resp.status_code == 200
        assert b3dm_resp.content == b"b3dm_mock_data"

        # 路径遍历拦截
        assert client.get("/tiles/../secret").status_code == 404

