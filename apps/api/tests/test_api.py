import json
import math
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.main import create_app
from scripts.publish_model_footprint import leaf_tiles


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        database_url="",
        mapbox_token="public-test-token",
        cesium_ion_access_token="ion-test-token",
        cesium_ion_terrain_asset_id="5910083",
        cesium_ion_imagery_asset_id="3830182",
        model_height_offset=-40,
        minio_endpoint="http://objects.test",
        minio_bucket="slope-twin",
        geocloud_wms_url="https://geology.test/wms?tk=secret",
    )


def use_mock_http(app, handler):
    original = app.state.infrastructure.http
    app.state.infrastructure.http = httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    )
    return original


def test_leaf_tiles_follow_external_tileset(tmp_path):
    child = tmp_path / "child.json"
    child.write_text(json.dumps({"root": {"content": {"uri": "leaf.glb"}}}))
    root = tmp_path / "tileset.json"
    root.write_text(
        json.dumps({"root": {"content": {"uri": "child.json"}}})
    )

    assert leaf_tiles(root) == [(tmp_path / "leaf.glb").resolve()]


def test_public_config_excludes_private_settings(settings):
    settings.database_url = "postgresql://private:secret@localhost/test"
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["mapboxToken"] == "public-test-token"
    assert response.json()["tilesetUrl"] == "/tiles/tileset.json"
    assert response.json()["terrainUrl"] == "/tiles/terrain/"
    assert response.json()["cesiumIonAccessToken"] == "ion-test-token"
    assert response.json()["cesiumIonTerrainAssetId"] == 5910083
    assert response.json()["cesiumIonImageryAssetId"] == 3830182
    assert response.json()["modelHeightOffset"] == -40
    assert response.json()["geologyAvailable"] is True
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


def test_contours_are_loaded_from_geoserver_wfs(settings):
    seen: list[httpx.Request] = []
    collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "MultiLineString", "coordinates": []},
                "properties": {"elevation": 1208},
            }
        ],
    }

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=collection)

    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(app, upstream)
        response = client.get("/api/features/contours?interval=10")
        app.state.infrastructure.http = original

    assert response.json() == collection
    assert seen[0].url.params["typeNames"] == "ne:majiadi_contours"
    assert seen[0].url.params["srsName"] == "EPSG:4326"
    assert seen[0].url.params["CQL_FILTER"] == "elevation/10=floor(elevation/10)"


def test_contours_reject_unsupported_interval(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/features/contours?interval=3").status_code == 422


def test_model_footprint_is_loaded_from_geoserver_wfs(settings):
    seen: list[httpx.Request] = []
    collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "MultiPolygon", "coordinates": []},
                "properties": {"id": 1},
            }
        ],
    }

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=collection)

    app = create_app(settings)
    with TestClient(app) as client:
        original = use_mock_http(app, upstream)
        response = client.get("/api/features/model-footprint")
        app.state.infrastructure.http = original

    assert response.json() == collection
    assert seen[0].url.params["typeNames"] == "ne:model_footprint"
    assert seen[0].url.params["srsName"] == "EPSG:4326"


def test_geology_tiles_proxy_all_queryable_layers_with_token_last(settings):
    seen: list[httpx.Request] = []

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nfixture")

    app = create_app(settings)
    with TestClient(app) as client:
        original = app.state.infrastructure.geocloud_http
        app.state.infrastructure.geocloud_http = httpx.AsyncClient(
            transport=httpx.MockTransport(upstream)
        )
        response = client.get("/api/geology/0/0/0.png")
        app.state.infrastructure.geocloud_http = original

    assert response.status_code == 200
    assert seen[0].url.params["REQUEST"] == "GetMap"
    assert seen[0].url.params["LAYERS"] == ",".join(f"t{i}" for i in range(13))
    assert str(seen[0].url).endswith("tk=secret")


def test_geology_token_can_be_overridden_per_request(settings):
    seen: list[httpx.Request] = []

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nfixture")

    app = create_app(settings)
    token = "new.header-token_1234567890"
    with TestClient(app) as client:
        original = app.state.infrastructure.geocloud_http
        app.state.infrastructure.geocloud_http = httpx.AsyncClient(
            transport=httpx.MockTransport(upstream)
        )
        response = client.get(
            "/api/geology/0/0/0.png", headers={"X-Geocloud-Token": token}
        )
        invalid = client.get(
            "/api/geology/0/0/0.png", headers={"X-Geocloud-Token": "bad token"}
        )
        app.state.infrastructure.geocloud_http = original

    assert response.status_code == 200
    assert invalid.status_code == 422
    assert seen[0].url.params["tk"] == token
    assert "secret" not in str(seen[0].url)


def test_geology_feature_info_is_parsed_as_json(settings):
    seen: list[httpx.Request] = []
    result = "<table><tr><td>时代</td><td>岩性</td></tr>" \
        "<tr><td>Q</td><td>页岩</td></tr></table>"

    def upstream(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, text=result)

    app = create_app(settings)
    with TestClient(app) as client:
        original = app.state.infrastructure.geocloud_http
        app.state.infrastructure.geocloud_http = httpx.AsyncClient(
            transport=httpx.MockTransport(upstream)
        )
        response = client.get(
            "/api/geology/info",
            params={
                "west": 98.87,
                "south": 27.04,
                "east": 98.89,
                "north": 27.06,
                "width": 800,
                "height": 600,
                "x": 400,
                "y": 300,
            },
        )
        invalid = client.get(
            "/api/geology/info",
            params={
                "west": 98.89,
                "south": 27.04,
                "east": 98.87,
                "north": 27.06,
                "width": 800,
                "height": 600,
                "x": 900,
                "y": 300,
            },
        )
        app.state.infrastructure.geocloud_http = original

    assert response.json() == {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"时代": "Q", "岩性": "页岩"}}
        ],
    }
    assert invalid.status_code == 422
    assert seen[0].url.params["REQUEST"] == "GetFeatureInfo"
    assert seen[0].url.params["LAYERS"] == "t0"
    assert seen[0].url.params["QUERY_LAYERS"] == "t0"
    assert seen[0].url.params["SRS"] == "EPSG:4326"
    assert seen[0].url.params["INFO_FORMAT"] == "text/html"
    assert seen[0].url.params["X"] == "400"
