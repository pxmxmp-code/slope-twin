"""Build and publish the model footprint from the finest GLB mesh vertices.

Run with:
  uv run --with numpy --with shapely --with pyproj python -m scripts.publish_model_footprint PROJECT_ROOT
"""

import argparse
import json
from pathlib import Path
import struct

import httpx
import psycopg

from app.config import Settings


def polygon_parts(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    return [part for part in geometry.geoms if part.geom_type == "Polygon"]


def world_positions(positions, tileset_transform):
    """Apply the same column-major local-to-ECEF matrix as Cesium."""
    import numpy as np

    matrix = np.asarray(tileset_transform, dtype="float64").reshape(4, 4, order="F")
    return positions @ matrix[:3, :3].T + matrix[:3, 3]


def leaf_tiles(tileset: Path) -> list[Path]:
    tiles: list[Path] = []
    visited: set[Path] = set()

    def load(path: Path):
        path = path.resolve()
        if path in visited:
            return
        visited.add(path)
        document = json.loads(path.read_text(encoding="utf-8"))
        walk(document["root"], path.parent)

    def walk(node: dict, directory: Path):
        if "transform" in node and directory != tileset.resolve().parent:
            raise ValueError("检测到子瓦片变换，需要先组合父子矩阵")
        children = node.get("children") or []
        for child in children:
            walk(child, directory)

        uri = (node.get("content") or {}).get("uri", "")
        if uri.lower().endswith(".json"):
            load(directory / uri)
        elif not children and uri.lower().endswith(".glb"):
            tiles.append((directory / uri).resolve())

    load(tileset)
    if not tiles:
        raise ValueError("3D Tiles 中没有找到叶级 GLB")
    return tiles


def mesh_hull(path: Path, tileset_transform, to_projected):
    import numpy as np
    from shapely.geometry import MultiPoint

    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"不是 glTF 2.0 GLB: {path}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"GLB 缺少 JSON 块: {path}")
    document = json.loads(data[20 : 20 + json_length].rstrip(b"\x00 "))
    binary_header = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", data, binary_header)
    if binary_type != 0x004E4942:
        raise ValueError(f"GLB 缺少 BIN 块: {path}")
    binary_offset = binary_header + 8

    primitive = document["meshes"][0]["primitives"][0]
    accessor = document["accessors"][primitive["attributes"]["POSITION"]]
    view = document["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
        raise ValueError(f"不支持的 POSITION 格式: {path}")
    offset = binary_offset + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", 12)
    positions = np.ndarray(
        (accessor["count"], 3),
        dtype="<f4",
        buffer=data,
        offset=offset,
        strides=(stride, 4),
    )
    # This exporter wraps Z-up coordinates in a Z-to-Y conversion. Cesium's
    # glTF Y-to-Z conversion cancels it; keep RTC's full XYZ, including height.
    nodes = document["nodes"]
    axis_matrix = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]
    if not (
        len(document["meshes"]) == 1
        and len(document["meshes"][0]["primitives"]) == 1
        and len(nodes) == 3
        and nodes[0] == {"mesh": 0}
        and nodes[1].get("children") == [0]
        and set(nodes[1]) <= {"children", "translation", "name"}
        and nodes[2].get("children") == [1]
        and nodes[2].get("matrix") == axis_matrix
        and document["scenes"][document.get("scene", 0)]["nodes"] == [2]
    ):
        raise ValueError(f"GLB 节点变换不符合已验证的导出结构: {path}")
    local = positions.astype("float64") + nodes[1]["translation"]
    world = world_positions(local, tileset_transform)
    x, y, _ = to_projected.transform(*world.T)
    xy = np.column_stack((x, y))
    # ponytail: per-leaf convex hull bridges within-tile concavities;
    # triangle union is needed if sub-tile holes must be retained.
    return MultiPoint(xy).convex_hull, len(xy)


def extract_footprint(project_root: Path, inset: float, simplify: float):
    from pyproj import Transformer
    from shapely.geometry import MultiPolygon
    from shapely.ops import transform, unary_union

    tileset = project_root / "TILES" / "tileset.json"
    tileset_transform = json.loads(tileset.read_text())["root"]["transform"]
    # EPSG:4521 is used only for metre-based buffering, never as the model origin.
    to_projected = Transformer.from_crs(4978, 4521, always_xy=True)
    tiles = leaf_tiles(tileset)
    polygons = []
    vertices = 0
    for index, tile in enumerate(tiles, 1):
        hull, count = mesh_hull(tile, tileset_transform, to_projected)
        vertices += count
        if hull.geom_type == "Polygon":
            polygons.append(hull)
        if index % 1000 == 0:
            print(f"已处理 {index}/{len(tiles)} 个叶瓦片", flush=True)

    footprint = (
        unary_union(polygons).buffer(-inset).simplify(simplify, preserve_topology=True)
    )
    footprint = MultiPolygon(polygon_parts(footprint))
    to_wgs84 = Transformer.from_crs(4521, 4326, always_xy=True).transform
    geometry = MultiPolygon(polygon_parts(transform(to_wgs84, footprint)))
    return geometry, len(tiles), vertices


def write_postgis(settings: Settings, geometry, source: str):
    from shapely.geometry import mapping

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL 未配置")
    payload = json.dumps(mapping(geometry))
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError("生成的覆盖边界为空或无效，保留现有数据库边界")
    with psycopg.connect(settings.database_url) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS public.model_footprint ("
            "id integer PRIMARY KEY, source text NOT NULL, "
            "geom geometry(MultiPolygon, 4326) NOT NULL)"
        )
        connection.execute("TRUNCATE public.model_footprint")
        connection.execute(
            "INSERT INTO public.model_footprint (id, source, geom) "
            "VALUES (1, %s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))",
            (source, payload),
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS model_footprint_geom_idx "
            "ON public.model_footprint USING gist (geom)"
        )


def publish_geoserver(settings: Settings, user: str, password: str):
    prefix, _, _ = settings.geoserver_wms_url.partition("/geoserver")
    base = f"{prefix}/geoserver"
    collection = f"{base}/rest/workspaces/ne/datastores/slope_twin_postgis/featuretypes"
    item = f"{collection}/model_footprint.json"
    body = {
        "featureType": {
            "name": "model_footprint",
            "nativeName": "model_footprint",
            "title": "实景模型有效覆盖范围",
            "srs": "EPSG:4326",
            "enabled": True,
        }
    }
    with httpx.Client(auth=(user, password), timeout=30) as client:
        current = client.get(item)
        if current.status_code == 404:
            response = client.post(collection, json=body)
        else:
            current.raise_for_status()
            response = client.put(
                item,
                params={"recalculate": "nativebbox,latlonbbox"},
                json=body,
            )
        response.raise_for_status()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_root", type=Path)
    parser.add_argument("--inset", type=float, default=0.5)
    parser.add_argument("--simplify", type=float, default=0.3)
    parser.add_argument("--geoserver-user", default="admin")
    parser.add_argument("--geoserver-password", default="geoserver")
    args = parser.parse_args()

    geometry, tiles, vertices = extract_footprint(
        args.project_root, args.inset, args.simplify
    )
    settings = Settings()
    write_postgis(settings, geometry, "3D Tiles mesh hull / tileset ECEF transform v2")
    publish_geoserver(settings, args.geoserver_user, args.geoserver_password)
    print(
        json.dumps(
            {
                "geometry": geometry.geom_type,
                "parts": len(geometry.geoms),
                "leaf_tiles": tiles,
                "mesh_vertices": vertices,
                "bounds": list(geometry.bounds),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
