"""Offline GIS regression: uv run --with numpy --with pyproj pytest -q."""

import pytest

np = pytest.importorskip("numpy")
pyproj = pytest.importorskip("pyproj")

from scripts.publish_model_footprint import world_positions


def test_model_origin_uses_tileset_ecef_not_osgb_metadata():
    matrix = [
        -0.9880080145122233, -0.15440260120740917, 0, 0,
        0.07021798792288463, -0.4493184330330015, 0.8906078710121698, 0,
        -0.1375121719400718, 0.8799277143476922, 0.45477205289152306, 0,
        -877890.0006415766, 5617537.20281493, 2883869.616982476, 1,
    ]
    points = world_positions(np.array([[0, 0, 0], [0, 0, 100]]), matrix)
    to_wgs84 = pyproj.Transformer.from_crs(4978, 4979, always_xy=True)
    lon, lat, height = to_wgs84.transform(*points[0])
    assert lon == pytest.approx(98.88215073554042, abs=1e-9)
    assert lat == pytest.approx(27.05023117994314, abs=1e-9)
    assert to_wgs84.transform(*points[1])[2] - height == pytest.approx(100, abs=.001)

    wrong_lon, wrong_lat = pyproj.Transformer.from_crs(
        4521, 4326, always_xy=True
    ).transform(33488309, 2993242)
    distance = pyproj.Geod(ellps="WGS84").inv(lon, lat, wrong_lon, wrong_lat)[2]
    assert 40 < distance < 41
