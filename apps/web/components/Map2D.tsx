"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  CARTO_DARK_LABELS,
  CARTO_DARK_TILES,
  CARTO_LIGHT_LABELS,
  CARTO_LIGHT_TILES,
  DEFAULT_SENSORS,
  tiandituUrl,
  type ViewProps,
} from "./types";

function calculateDistance(coords: [number, number][]): {
  totalMeters: number;
  segments: number[];
} {
  if (coords.length < 2) return { totalMeters: 0, segments: [] };
  let total = 0;
  const segments: number[] = [];
  const R = 6371000;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    segments.push(d);
    total += d;
  }
  return { totalMeters: total, segments };
}

export default function Map2D({
  config,
  layers,
  locate,
  measureMode,
  clearMeasureTrigger,
  presetPitch,
  onStatus,
  onTelemetryChange,
  onSensorSelect,
}: ViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Callbacks and mutable state in refs to prevent unnecessary map re-instantiations
  const onTelemetryChangeRef = useRef(onTelemetryChange);
  onTelemetryChangeRef.current = onTelemetryChange;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onSensorSelectRef = useRef(onSensorSelect);
  onSensorSelectRef.current = onSensorSelect;
  const measureModeRef = useRef(measureMode);
  measureModeRef.current = measureMode;
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [measureDist, setMeasureDist] = useState(0);
  const sensorMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // 1. Initialize Mapbox GL instance ONCE
  const token = config.mapboxToken;
  const bounds = config.bounds;
  const boundsKey = bounds.join(",");
  const domTiles = config.domTiles;
  const tiandituToken = config.tiandituToken;

  useEffect(() => {
    if (!token || !container.current) return;

    onStatusRef.current("正在加载二维地图…");

    const map = new mapboxgl.Map({
      container: container.current,
      accessToken: token,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f8fafc" },
          },
        ],
      },
      bounds: bounds,
      fitBoundsOptions: { padding: 80 },
      maxZoom: 22,
      attributionControl: false,
    });
    mapRef.current = map;

    const navControl = new mapboxgl.NavigationControl({
      showCompass: true,
      visualizePitch: true,
    });
    map.addControl(navControl, "top-right");

    const scaleControl = new mapboxgl.ScaleControl({ unit: "metric" });
    map.addControl(scaleControl, "bottom-left");

    map.on("error", (event) => {
      const source = (event as { sourceId?: string }).sourceId;
      onStatusRef.current(
        source === "dom"
          ? "DOM 加载失败，请检查 GeoServer 服务。"
          : "地图资源加载失败，请检查令牌、域名授权或网络。",
      );
    });

    map.on("mousemove", (e) => {
      onTelemetryChangeRef.current?.({
        lon: Number(e.lngLat.lng.toFixed(6)),
        lat: Number(e.lngLat.lat.toFixed(6)),
        zoom: Number(map.getZoom().toFixed(1)),
        pitch: Math.round(map.getPitch()),
        heading: Math.round(map.getBearing()),
      });
    });

    map.on("click", (e) => {
      if (measureModeRef.current === "distance") {
        const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        setMeasurePoints((prev) => {
          const next = [...prev, pt];
          const dist = calculateDistance(next);
          setMeasureDist(dist.totalMeters);

          const m = mapRef.current;
          if (m && m.getSource("measure-src")) {
            const src = m.getSource("measure-src") as mapboxgl.GeoJSONSource;
            src.setData({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: next,
                  },
                },
                ...next.map((p) => ({
                  type: "Feature" as const,
                  properties: {},
                  geometry: { type: "Point" as const, coordinates: p },
                })),
              ],
            });
          }
          return next;
        });
      }
    });

    map.on("load", () => {
      // 1. Light Basemap
      map.addSource("carto-light-src", {
        type: "raster",
        tiles: [CARTO_LIGHT_TILES],
        tileSize: 256,
        maxzoom: 19,
      });
      map.addLayer({
        id: "basemap-light",
        type: "raster",
        source: "carto-light-src",
        layout: { visibility: "visible" },
      });

      // Light Labels
      map.addSource("carto-light-labels-src", {
        type: "raster",
        tiles: [CARTO_LIGHT_LABELS],
        tileSize: 256,
        maxzoom: 19,
      });
      map.addLayer({
        id: "labels-light",
        type: "raster",
        source: "carto-light-labels-src",
        layout: { visibility: "visible" },
      });

      // Dark Basemap
      map.addSource("carto-dark-src", {
        type: "raster",
        tiles: [CARTO_DARK_TILES],
        tileSize: 256,
        maxzoom: 19,
      });
      map.addLayer({
        id: "basemap-dark",
        type: "raster",
        source: "carto-dark-src",
        layout: { visibility: "none" },
      });

      map.addSource("carto-dark-labels-src", {
        type: "raster",
        tiles: [CARTO_DARK_LABELS],
        tileSize: 256,
        maxzoom: 19,
      });
      map.addLayer({
        id: "labels-dark",
        type: "raster",
        source: "carto-dark-labels-src",
        layout: { visibility: "none" },
      });

      // 2. Tianditu Vector & Satellite
      if (tiandituToken) {
        map.addSource("tdt-vec-src", {
          type: "raster",
          tiles: [tiandituUrl("vec", tiandituToken)],
          tileSize: 256,
          maxzoom: 18,
        });
        map.addLayer({
          id: "basemap-vec",
          type: "raster",
          source: "tdt-vec-src",
          layout: { visibility: "none" },
        });

        map.addSource("tdt-sat-src", {
          type: "raster",
          tiles: [tiandituUrl("img", tiandituToken)],
          tileSize: 256,
          maxzoom: 18,
        });
        map.addLayer({
          id: "basemap-sat",
          type: "raster",
          source: "tdt-sat-src",
          layout: { visibility: "none" },
        });

        map.addSource("tdt-cva-src", {
          type: "raster",
          tiles: [tiandituUrl("cva", tiandituToken)],
          tileSize: 256,
          maxzoom: 18,
        });
        map.addLayer({
          id: "labels-cva",
          type: "raster",
          source: "tdt-cva-src",
          layout: { visibility: "none" },
        });
      }

      // 3. DOM Layer
      map.addSource("dom", {
        type: "raster",
        tiles: [
          new URL(domTiles, window.location.origin).href
            .replaceAll("%7B", "{")
            .replaceAll("%7D", "}"),
        ],
        tileSize: 256,
        bounds: bounds,
        maxzoom: 22,
      });
      map.addLayer({
        id: "dom",
        type: "raster",
        source: "dom",
        paint: { "raster-fade-duration": 0 },
      });

      // 4. Project Boundary
      const [w, s, e, n] = bounds;
      map.addSource("project-bounds-src", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      });
      map.addLayer({
        id: "project-bounds-line",
        type: "line",
        source: "project-bounds-src",
        paint: {
          "line-color": "#2563eb",
          "line-width": 2,
          "line-dasharray": [4, 2],
          "line-opacity": 0.85,
        },
      });

      // 5. Measure Layer
      map.addSource("measure-src", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      map.addLayer({
        id: "measure-lines",
        type: "line",
        source: "measure-src",
        paint: {
          "line-color": "#2563eb",
          "line-width": 3,
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: "measure-points",
        type: "circle",
        source: "measure-src",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#2563eb",
        },
      });

      // 6. JMD Feature Layer (Residential buildings)
      map.addSource("jmd-src", {
        type: "geojson",
        data: "/api/features/jmd",
      });
      map.addLayer({
        id: "jmd-fill",
        type: "fill",
        source: "jmd-src",
        layout: {
          visibility: layersRef.current.jmd ? "visible" : "none",
        },
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "jmd-line",
        type: "line",
        source: "jmd-src",
        layout: {
          visibility: layersRef.current.jmd ? "visible" : "none",
        },
        paint: {
          "line-color": "#1d4ed8",
          "line-width": 2,
        },
      });

      // Hover and click interaction on residential buildings
      map.on("mouseenter", "jmd-fill", () => {
        if (measureModeRef.current === "none") {
          map.getCanvas().style.cursor = "pointer";
        }
      });
      map.on("mouseleave", "jmd-fill", () => {
        if (measureModeRef.current === "none") {
          map.getCanvas().style.cursor = "";
        }
      });

      map.on("click", "jmd-fill", (e) => {
        if (measureModeRef.current !== "none") return;
        if (!e.features?.[0]) return;
        const feat = e.features[0] as unknown as {
          properties?: Record<string, unknown>;
        };
        const props = (feat.properties || {}) as {
          id?: number;
          xm?: string;
          rs?: number;
          shape_length?: number;
          shape_area?: number;
        };
        const area =
          props.shape_area !== undefined
            ? Number(props.shape_area).toFixed(2)
            : "--";
        const len =
          props.shape_length !== undefined
            ? Number(props.shape_length).toFixed(2)
            : "--";

        new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: "jmd-popup",
          maxWidth: "280px",
        })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1e293b; padding: 4px;">
              <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                <span>🏠 居民地要素</span>
                <span style="font-size: 11px; color: #2563eb; background: #eff6ff; padding: 1px 6px; border-radius: 4px;">ID #${props.id ?? ""}</span>
              </div>
              <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; line-height: 1.5;">
                <span style="color: #64748b;">项目标识:</span>
                <span style="font-weight: 600; color: #0f172a;">${props.xm ?? "--"}</span>
                <span style="color: #64748b;">常住人口:</span>
                <span style="font-weight: 600; color: #2563eb;">${props.rs ?? 0} 人</span>
                <span style="color: #64748b;">占地面积:</span>
                <span style="font-weight: 600; color: #0f172a;">${area} ㎡</span>
                <span style="color: #64748b;">轮廓周长:</span>
                <span style="font-weight: 600; color: #0f172a;">${len} m</span>
              </div>
            </div>`,
          )
          .addTo(map);
      });

      // Apply initial layers state
      const state = layersRef.current;
      if (mLayerExists(map, "dom")) {
        map.setLayoutProperty(
          "dom",
          "visibility",
          state.dom ? "visible" : "none",
        );
        map.setPaintProperty("dom", "raster-opacity", state.opacity);
      }

      onStatusRef.current("二维视图已就绪");
    });

    // Resize observer to prevent map stretching or flicker on container resize
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    if (container.current) {
      ro.observe(container.current);
    }

    return () => {
      ro.disconnect();
      for (const marker of sensorMarkersRef.current) marker.remove();
      sensorMarkersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, [token, boundsKey, domTiles, tiandituToken]);

  function mLayerExists(map: mapboxgl.Map, id: string) {
    try {
      return Boolean(map.getLayer(id));
    } catch {
      return false;
    }
  }

  // 2. Update layers visibility smoothly without rebuilding the map
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;

    const basemapLayers = [
      "basemap-light",
      "basemap-dark",
      "basemap-vec",
      "basemap-sat",
    ];
    for (const id of basemapLayers) {
      if (mLayerExists(m, id)) {
        let visible = false;
        if (layers.basemap) {
          if (layers.basemapType === "light" && id === "basemap-light")
            visible = true;
          if (layers.basemapType === "dark" && id === "basemap-dark")
            visible = true;
          if (layers.basemapType === "vector" && id === "basemap-vec")
            visible = true;
          if (layers.basemapType === "satellite" && id === "basemap-sat")
            visible = true;
        }
        m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }

    const labelLayers = ["labels-light", "labels-cva", "labels-dark"];
    for (const id of labelLayers) {
      if (mLayerExists(m, id)) {
        let visible = false;
        if (layers.labels) {
          if (layers.basemapType === "light" && id === "labels-light")
            visible = true;
          if (layers.basemapType === "dark" && id === "labels-dark")
            visible = true;
          if (
            (layers.basemapType === "vector" ||
              layers.basemapType === "satellite") &&
            id === "labels-cva"
          )
            visible = true;
        }
        m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }

    if (mLayerExists(m, "dom")) {
      m.setLayoutProperty("dom", "visibility", layers.dom ? "visible" : "none");
      m.setPaintProperty("dom", "raster-opacity", layers.opacity);
    }

    if (mLayerExists(m, "jmd-fill")) {
      m.setLayoutProperty(
        "jmd-fill",
        "visibility",
        layers.jmd ? "visible" : "none",
      );
    }
    if (mLayerExists(m, "jmd-line")) {
      m.setLayoutProperty(
        "jmd-line",
        "visibility",
        layers.jmd ? "visible" : "none",
      );
    }
  }, [
    layers.basemap,
    layers.basemapType,
    layers.labels,
    layers.dom,
    layers.opacity,
    layers.jmd,
  ]);

  // 3. Sensor markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of sensorMarkersRef.current) marker.remove();
    sensorMarkersRef.current = [];

    if (layers.sensors) {
      DEFAULT_SENSORS.forEach((sensor) => {
        const isWarn = sensor.status === "warning";
        const el = document.createElement("div");
        el.className = "sensor-marker";
        el.style.cursor = "pointer";
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="display: flex; align-items: center; gap: 4px; padding: 2px 6px; background: #ffffff; border: 1px solid ${isWarn ? "#f59e0b" : "#2563eb"}; border-radius: 6px; font-size: 11px; color: #0f172a; font-family: ui-monospace, monospace; font-weight: 600; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${isWarn ? "#f59e0b" : "#10b981"};"></span>
              ${sensor.id}
            </div>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${isWarn ? "#f59e0b" : "#2563eb"}; border: 2px solid #ffffff; margin-top: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
          </div>
        `;
        el.onclick = () => {
          onSensorSelectRef.current?.(sensor);
        };
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([sensor.lon, sensor.lat])
          .addTo(map);
        sensorMarkersRef.current.push(marker);
      });
    }
  }, [layers.sensors]);

  // 4. Clear measure
  useEffect(() => {
    setMeasurePoints([]);
    setMeasureDist(0);
    const m = mapRef.current;
    if (m && m.getSource("measure-src")) {
      const src = m.getSource("measure-src") as mapboxgl.GeoJSONSource;
      src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [clearMeasureTrigger]);

  // 5. Preset Pitch & Heading
  useEffect(() => {
    if (!presetPitch || !mapRef.current) return;
    mapRef.current.easeTo({
      pitch: presetPitch.pitch,
      bearing: presetPitch.heading ?? mapRef.current.getBearing(),
      duration: 800,
    });
  }, [presetPitch]);

  // 6. Locate trigger
  useEffect(() => {
    mapRef.current?.fitBounds(config.bounds, { padding: 80, duration: 800 });
  }, [locate, config.bounds]);

  return (
    <>
      <div ref={container} className="map-canvas" />

      {/* Floating Measurement HUD */}
      {measureMode === "distance" && (
        <div className="measure-hud" role="region" aria-label="测距信息">
          <span>
            📐 测距模式：已选 <b>{measurePoints.length}</b> 点
          </span>
          {measurePoints.length >= 2 && (
            <span>
              总距离：
              <b style={{ color: "#2563eb", fontSize: "14px" }}>
                {measureDist >= 1000
                  ? `${(measureDist / 1000).toFixed(2)} km`
                  : `${measureDist.toFixed(1)} m`}
              </b>
            </span>
          )}
          <span style={{ color: "#64748b", fontSize: "11px" }}>
            在地图上点击添加测量点
          </span>
        </div>
      )}

      {!config.mapboxToken && (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <h2>连接二维地图</h2>
          <p>
            填写根目录 .env 中的 MAPBOX_TOKEN 并重启后端，即可浏览正射影像。
          </p>
          <p>
            天地图电子地图和中文注记另需
            TIANDITU_TOKEN。三维实景可直接在上方切换浏览。
          </p>
        </div>
      )}
    </>
  );
}
