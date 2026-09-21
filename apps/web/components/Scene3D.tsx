"use client";

import { useEffect, useRef } from "react";
import type * as Cesium from "cesium";
import { tiandituUrl, type ViewProps } from "./types";

declare global {
  interface Window {
    Cesium: typeof Cesium;
    CESIUM_BASE_URL: string;
  }
}

let cesiumPromise: Promise<typeof Cesium> | undefined;
function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (!cesiumPromise)
    cesiumPromise = new Promise<typeof Cesium>((resolve, reject) => {
      window.CESIUM_BASE_URL = "/cesium/";
      const script = document.createElement("script");
      script.src = "/cesium/Cesium.js";
      script.onload = () => resolve(window.Cesium);
      script.onerror = () => {
        script.remove();
        cesiumPromise = undefined;
        reject(new Error("Cesium 加载失败"));
      };
      document.head.appendChild(script);
    });
  return cesiumPromise;
}

export default function Scene3D({
  config,
  layers,
  locate,
  onStatus,
}: ViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const modelRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const imageryRef = useRef<{
    basemap?: Cesium.ImageryLayer;
    labels?: Cesium.ImageryLayer;
  }>({});
  const latestLayers = useRef(layers);
  latestLayers.current = layers;

  useEffect(() => {
    let disposed = false;
    let viewer: Cesium.Viewer | undefined;
    async function initialize() {
      onStatus("正在加载三维场景…");
      try {
        const C = await loadCesium();
        if (disposed || !container.current) return;
        viewer = new C.Viewer(container.current, {
          baseLayer: false,
          baseLayerPicker: false,
          geocoder: false,
          animation: false,
          timeline: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          terrainProvider: new C.EllipsoidTerrainProvider(),
          requestRenderMode: true,
        });
        viewerRef.current = viewer;
        viewer.scene.globe.baseColor = C.Color.fromCssColorString("#e3e9e2");
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.camera.setView({
          destination: C.Rectangle.fromDegrees(...config.bounds),
        });
        viewer.scene.renderError.addEventListener(() =>
          onStatus("三维渲染失败，请检查浏览器 WebGL 或刷新页面。"),
        );
        if (config.tiandituToken) {
          for (const [id, layer] of [
            ["basemap", "vec"],
            ["labels", "cva"],
          ] as const) {
            const provider = new C.UrlTemplateImageryProvider({
              url: tiandituUrl(layer, config.tiandituToken),
              maximumLevel: 18,
              credit: "© 天地图",
            });
            provider.errorEvent.addEventListener(() =>
              onStatus("天地图加载失败，请检查 key、域名授权或网络。"),
            );
            const imagery = viewer.imageryLayers.addImageryProvider(provider);
            imagery.show = latestLayers.current[id];
            imageryRef.current[id] = imagery;
          }
        }
        const model = await C.Cesium3DTileset.fromUrl(config.tilesetUrl, {
          maximumScreenSpaceError: 16,
          cacheBytes: 256 * 1024 * 1024,
        });
        if (disposed) {
          model.destroy();
          return;
        }
        viewer.scene.primitives.add(model);
        modelRef.current = model;
        model.show = latestLayers.current.model;
        let failed = false;
        model.tileFailed.addEventListener(() => {
          failed = true;
          onStatus("部分模型瓦片加载失败，请检查模型文件是否完整。");
        });
        model.allTilesLoaded.addEventListener(() => {
          if (!disposed && !failed && model.show)
            onStatus("三维实景已加载，模型按视距更新");
        });
        viewer.camera.viewBoundingSphere(
          model.boundingSphere,
          new C.HeadingPitchRange(
            0,
            C.Math.toRadians(-40),
            model.boundingSphere.radius * 2.8,
          ),
        );
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
        onStatus(
          model.show
            ? "三维场景已定位，正在加载模型…"
            : "三维场景已定位，模型已隐藏",
        );
      } catch {
        if (!disposed)
          onStatus("三维加载失败，请检查模型入口、后端服务及浏览器 WebGL。");
      }
    }
    void initialize();
    return () => {
      disposed = true;
      modelRef.current = null;
      viewerRef.current = null;
      imageryRef.current = {};
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [config, onStatus]);

  useEffect(() => {
    if (modelRef.current) modelRef.current.show = layers.model;
    for (const id of ["basemap", "labels"] as const) {
      const imagery = imageryRef.current[id];
      if (imagery) imagery.show = layers[id];
    }
    viewerRef.current?.scene.requestRender();
  }, [layers]);

  useEffect(() => {
    const model = modelRef.current;
    if (model && viewerRef.current) {
      const C = window.Cesium;
      viewerRef.current.camera.flyToBoundingSphere(model.boundingSphere, {
        duration: 1,
        offset: new C.HeadingPitchRange(
          0,
          C.Math.toRadians(-40),
          model.boundingSphere.radius * 2.8,
        ),
      });
    }
  }, [locate]);

  return <div className="map-canvas" ref={container} />;
}
