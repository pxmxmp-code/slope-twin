"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { tiandituUrl, type ViewProps } from "./types";

export default function Map2D({ config, layers, locate, onStatus }: ViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const latestLayers = useRef(layers);
  latestLayers.current = layers;

  useEffect(() => {
    if (!config.mapboxToken || !container.current) return;
    let map: mapboxgl.Map;
    const apply = () => {
      const state = latestLayers.current;
      for (const id of ["basemap", "labels", "dom"] as const) {
        if (map.getLayer(id))
          map.setLayoutProperty(
            id,
            "visibility",
            state[id] ? "visible" : "none",
          );
      }
      if (map.getLayer("dom"))
        map.setPaintProperty("dom", "raster-opacity", state.opacity);
    };
    try {
      onStatus("正在加载二维地图…");
      map = new mapboxgl.Map({
        container: container.current,
        accessToken: config.mapboxToken,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#e7ece7" },
            },
          ],
        },
        bounds: config.bounds,
        fitBoundsOptions: { padding: 60 },
        maxZoom: 22,
        attributionControl: true,
      });
      mapRef.current = map;
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new mapboxgl.ScaleControl({ unit: "metric" }),
        "bottom-left",
      );
      map.on("error", (event) => {
        const source = (event as { sourceId?: string }).sourceId;
        onStatus(
          source === "dom"
            ? "DOM 加载失败，请检查 GeoServer 服务。"
            : "地图资源加载失败，请检查令牌、域名授权或网络。",
        );
      });
      map.on("load", () => {
        if (config.tiandituToken) {
          for (const [id, layer] of [
            ["basemap", "vec"],
            ["labels", "cva"],
          ] as const) {
            map.addSource(id, {
              type: "raster",
              tiles: [tiandituUrl(layer, config.tiandituToken)],
              tileSize: 256,
              maxzoom: 18,
              attribution: "© 天地图",
            });
          }
          map.addLayer({ id: "basemap", type: "raster", source: "basemap" });
        }
        map.addSource("dom", {
          type: "raster",
          tiles: [
            new URL(config.domTiles, window.location.origin).href
              .replaceAll("%7B", "{")
              .replaceAll("%7D", "}"),
          ],
          tileSize: 256,
          bounds: config.bounds,
          maxzoom: 22,
        });
        map.addLayer({
          id: "dom",
          type: "raster",
          source: "dom",
          paint: { "raster-fade-duration": 0 },
        });
        if (config.tiandituToken)
          map.addLayer({ id: "labels", type: "raster", source: "labels" });
        apply();
        onStatus("二维视图已就绪");
      });
    } catch {
      onStatus("二维引擎初始化失败，请确认浏览器支持 WebGL。");
    }
    return () => {
      mapRef.current = null;
      map?.remove();
    };
  }, [config, onStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of ["basemap", "labels", "dom"] as const) {
      if (map.getLayer(id))
        map.setLayoutProperty(
          id,
          "visibility",
          layers[id] ? "visible" : "none",
        );
    }
    if (map.getLayer("dom"))
      map.setPaintProperty("dom", "raster-opacity", layers.opacity);
  }, [layers]);

  useEffect(() => {
    mapRef.current?.fitBounds(config.bounds, { padding: 60, duration: 800 });
  }, [locate, config]);

  return (
    <>
      <div ref={container} className="map-canvas" />
      {!config.mapboxToken && (
        <div className="empty-state">
          <span className="empty-icon">◇</span>
          <h2>连接二维地图</h2>
          <p>
            填写根目录 .env 中的 MAPBOX_TOKEN 并重启后端，即可浏览正射影像。
          </p>
          <p>
            天地图电子地图和中文注记另需 TIANDITU_TOKEN。三维实景可先直接打开。
          </p>
        </div>
      )}
    </>
  );
}
