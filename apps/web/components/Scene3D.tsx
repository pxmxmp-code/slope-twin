"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type * as Cesium from "cesium";
import {
  CARTO_LIGHT_LABELS,
  CARTO_LIGHT_TILES,
  DEFAULT_SENSORS,
  tiandituUrl,
  type ViewProps,
} from "./types";
import { useCesiumMeasurement } from "./useCesiumMeasurement";

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

type ContourCollection = {
  features?: Array<{
    geometry?: { type?: string; coordinates?: unknown };
    properties?: { elevation?: unknown; fid?: unknown; id?: unknown };
  }>;
};

function addContours(
  C: typeof Cesium,
  source: Cesium.CustomDataSource,
  data: ContourCollection,
  groundElevation: number,
  opacity: number,
) {
  const labeled = new Set<number>();
  for (const feature of data.features ?? []) {
    const elevation = feature.properties?.elevation;
    const coordinates = feature.geometry?.coordinates;
    if (
      feature.geometry?.type !== "MultiLineString" ||
      typeof elevation !== "number" ||
      !Array.isArray(coordinates)
    )
      continue;

    const major = elevation % 20 === 0;
    for (const line of coordinates) {
      if (!Array.isArray(line)) continue;
      const positions = line.flatMap((coordinate) => {
        if (
          !Array.isArray(coordinate) ||
          typeof coordinate[0] !== "number" ||
          typeof coordinate[1] !== "number"
        )
          return [];
        return [
          C.Cartesian3.fromDegrees(
            coordinate[0],
            coordinate[1],
            elevation - groundElevation + 1,
          ),
        ];
      });
      if (positions.length < 2) continue;
      source.entities.add({
        properties: {
          elevation,
          fid: feature.properties?.fid,
          sourceId: feature.properties?.id,
        },
        polyline: {
          positions,
          width: major ? 2 : 1,
          material: C.Color.fromCssColorString(
            major ? "#f59e0b" : "#2563eb",
          ).withAlpha(opacity),
        },
      });
      if (major && !labeled.has(elevation)) {
        labeled.add(elevation);
        source.entities.add({
          position: positions[Math.floor(positions.length / 2)],
          properties: { elevation },
          label: {
            text: `${elevation} m`,
            font: "10px -apple-system, BlinkMacSystemFont, sans-serif",
            fillColor: C.Color.fromCssColorString("#92400e").withAlpha(opacity),
            outlineColor: C.Color.WHITE,
            outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new C.Cartesian2(0, -4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
    }
  }
}

export default function Scene3D({
  config,
  layers,
  locate,
  measureMode,
  clearMeasureTrigger,
  autoOrbit,
  presetPitch,
  onStatus,
  onTelemetryChange,
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

  const sensorEntitiesRef = useRef<Cesium.Entity[]>([]);
  const orbitListenerRef = useRef<(() => void) | null>(null);

  const jmdDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const contourDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [selectedJmd, setSelectedJmd] = useState<{
    id?: number;
    xm?: string;
    rs?: number;
    area?: string;
    len?: string;
  } | null>(null);
  const [selectedContour, setSelectedContour] = useState<{
    elevation: number;
    fid?: number;
    sourceId?: number;
  } | null>(null);

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onTelemetryChangeRef = useRef(onTelemetryChange);
  onTelemetryChangeRef.current = onTelemetryChange;
  const measureInfo = useCesiumMeasurement(
    viewerRef,
    measureMode,
    clearMeasureTrigger,
  );

  useEffect(() => {
    let disposed = false;
    let viewer: Cesium.Viewer | undefined;
    let removeContourLod: (() => void) | undefined;

    async function initialize() {
      onStatusRef.current("正在加载三维场景…");
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
          requestRenderMode: false,
        });
        viewerRef.current = viewer;
        setViewerReady(true);

        // Clean Natural Lighting, Daytime Sky, and Globe Base
        if (viewer.scene.skyBox) {
          viewer.scene.skyBox.show = false;
        }
        viewer.scene.globe.baseColor = C.Color.fromCssColorString("#e2e8f0");
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.backgroundColor = C.Color.fromCssColorString("#e8ecf2");

        // Fog & Atmosphere
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0001;
        viewer.scene.globe.enableLighting = false;

        viewer.camera.setView({
          destination: C.Rectangle.fromDegrees(...config.bounds),
        });

        viewer.scene.renderError.addEventListener(() =>
          onStatus("三维渲染失败，请检查浏览器 WebGL 或刷新页面。"),
        );

        const useTianditu = Boolean(config.tiandituToken);
        const basemapProvider = new C.UrlTemplateImageryProvider({
          url: useTianditu
            ? tiandituUrl("vec", config.tiandituToken)
            : CARTO_LIGHT_TILES,
          maximumLevel: useTianditu ? 18 : 19,
          credit: useTianditu ? "© 天地图" : undefined,
        });
        const basemap =
          viewer.imageryLayers.addImageryProvider(basemapProvider);
        basemap.show = layers.basemap;
        basemap.alpha = layers.opacity.basemap;
        imageryRef.current.basemap = basemap;

        const labelsProvider = new C.UrlTemplateImageryProvider({
          url: useTianditu
            ? tiandituUrl("cva", config.tiandituToken)
            : CARTO_LIGHT_LABELS,
          maximumLevel: useTianditu ? 18 : 19,
          credit: useTianditu ? "© 天地图注记" : undefined,
        });
        const labels = viewer.imageryLayers.addImageryProvider(labelsProvider);
        labels.show = layers.labels;
        labels.alpha = layers.opacity.labels;
        imageryRef.current.labels = labels;

        // 3. Load 3D Tileset
        const model = await C.Cesium3DTileset.fromUrl(config.tilesetUrl, {
          maximumScreenSpaceError: 16,
          cacheBytes: 512 * 1024 * 1024,
        });

        if (disposed) {
          model.destroy();
          return;
        }

        const normal = C.Ellipsoid.WGS84.geodeticSurfaceNormal(
          model.boundingSphere.center,
          new C.Cartesian3(),
        );
        const translation = C.Cartesian3.multiplyByScalar(
          normal,
          -config.groundElevation,
          new C.Cartesian3(),
        );
        model.modelMatrix = C.Matrix4.fromTranslation(translation);

        viewer.scene.primitives.add(model);
        modelRef.current = model;
        model.show = latestLayers.current.model;
        model.style = new C.Cesium3DTileStyle({
          color: `color('white', ${latestLayers.current.opacity.model})`,
        });

        let contourInterval = 0;
        let contourRequest = 0;
        const loadContours = async (interval: number) => {
          if (interval === contourInterval) return;
          contourInterval = interval;
          const request = ++contourRequest;
          try {
            const response = await fetch(
              `/api/features/contours?interval=${interval}`,
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as ContourCollection;
            if (
              request !== contourRequest ||
              disposed ||
              !viewer ||
              viewer.isDestroyed()
            )
              return;
            const source = new C.CustomDataSource(`contours-${interval}m`);
            addContours(
              C,
              source,
              data,
              config.groundElevation,
              latestLayers.current.opacity.contours,
            );
            source.show = latestLayers.current.contours;
            await viewer.dataSources.add(source);
            if (contourDataSourceRef.current)
              viewer.dataSources.remove(contourDataSourceRef.current, true);
            contourDataSourceRef.current = source;
          } catch (error) {
            contourInterval = 0;
            console.warn("Failed to load contours in Cesium:", error);
            onStatusRef.current("等高线加载失败，请检查 GeoServer WFS。");
          }
        };
        void loadContours(20);

        // 4. Load JMD Feature Service (Residential Buildings)
        void C.GeoJsonDataSource.load("/api/features/jmd", {
          clampToGround: true,
        })
          .then((jmdSource) => {
            if (!disposed && viewer && !viewer.isDestroyed()) {
              for (const entity of jmdSource.entities.values) {
                if (entity.polygon) {
                  entity.polygon.classificationType = new C.ConstantProperty(
                    C.ClassificationType.BOTH,
                  );
                  entity.polygon.material = new C.ColorMaterialProperty(
                    C.Color.fromCssColorString("#3b82f6").withAlpha(
                      latestLayers.current.opacity.jmd,
                    ),
                  );
                }
              }
              void viewer.dataSources.add(jmdSource);
              jmdDataSourceRef.current = jmdSource;
              jmdSource.show = latestLayers.current.jmd;
            }
          })
          .catch((jmdErr) => {
            console.warn("Failed to load JMD in Cesium:", jmdErr);
          });

        let failed = false;
        model.tileFailed.addEventListener(() => {
          failed = true;
          onStatusRef.current("部分模型瓦片加载失败，请检查模型文件是否完整。");
        });

        model.allTilesLoaded.addEventListener(() => {
          if (!disposed && !failed && model.show)
            onStatusRef.current("三维实景已加载，模型按视距更新");
        });

        // Initial camera view
        viewer.camera.viewBoundingSphere(
          model.boundingSphere,
          new C.HeadingPitchRange(
            0,
            C.Math.toRadians(-40),
            model.boundingSphere.radius * 2.8,
          ),
        );
        viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);

        removeContourLod = viewer.camera.moveEnd.addEventListener(() => {
          if (!viewer || disposed) return;
          const distance = C.Cartesian3.distance(
            viewer.camera.positionWC,
            model.boundingSphere.center,
          );
          const ratio = distance / model.boundingSphere.radius;
          void loadContours(ratio <= 2 ? 2 : ratio <= 4 ? 10 : 20);
        });

        onStatusRef.current(
          model.show
            ? "三维场景已定位，正在加载模型…"
            : "三维场景已定位，模型已隐藏",
        );

        viewer.camera.changed.addEventListener(() => {
          if (!viewer || disposed) return;
          const carto = viewer.camera.positionCartographic;
          if (onTelemetryChangeRef.current && carto) {
            onTelemetryChangeRef.current({
              lon: Number(C.Math.toDegrees(carto.longitude).toFixed(6)),
              lat: Number(C.Math.toDegrees(carto.latitude).toFixed(6)),
              alt: Math.round(carto.height),
              pitch: Math.round(C.Math.toDegrees(viewer.camera.pitch)),
              heading: Math.round(C.Math.toDegrees(viewer.camera.heading)),
            });
          }
        });
      } catch (err) {
        if (!disposed) {
          console.error("Scene3D init error:", err);
          onStatusRef.current(
            "三维加载失败: " +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      removeContourLod?.();
      if (orbitListenerRef.current) {
        orbitListenerRef.current();
        orbitListenerRef.current = null;
      }
      if (jmdDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.dataSources.remove(jmdDataSourceRef.current, true);
        } catch {}
      }
      if (contourDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.dataSources.remove(contourDataSourceRef.current, true);
        } catch {}
      }
      jmdDataSourceRef.current = null;
      contourDataSourceRef.current = null;
      modelRef.current = null;
      viewerRef.current = null;
      imageryRef.current = {};
      sensorEntitiesRef.current = [];
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [
    config.tilesetUrl,
    config.tiandituToken,
    config.groundElevation,
    config.bounds[0],
    config.bounds[1],
    config.bounds[2],
    config.bounds[3],
  ]);

  // Update Layers & Visual Options
  useEffect(() => {
    const viewer = viewerRef.current;
    const model = modelRef.current;
    const C = window.Cesium;
    if (!viewer || !C) return;

    if (model) {
      model.show = layers.model;
      model.style = new C.Cesium3DTileStyle({
        color: `color('white', ${layers.opacity.model})`,
      });
    }

    if (jmdDataSourceRef.current) {
      jmdDataSourceRef.current.show = layers.jmd;
      for (const entity of jmdDataSourceRef.current.entities.values)
        if (entity.polygon)
          entity.polygon.material = new C.ColorMaterialProperty(
            C.Color.fromCssColorString("#3b82f6").withAlpha(layers.opacity.jmd),
          );
    }
    if (contourDataSourceRef.current) {
      contourDataSourceRef.current.show = layers.contours;
      for (const entity of contourDataSourceRef.current.entities.values) {
        const elevation = entity.properties?.elevation?.getValue();
        if (entity.polyline)
          entity.polyline.material = new C.ColorMaterialProperty(
            C.Color.fromCssColorString(
              typeof elevation === "number" && elevation % 20 === 0
                ? "#f59e0b"
                : "#2563eb",
            ).withAlpha(layers.opacity.contours),
          );
        if (entity.label)
          entity.label.fillColor = new C.ConstantProperty(
            C.Color.fromCssColorString("#92400e").withAlpha(
              layers.opacity.contours,
            ),
          );
      }
    }
    if (!layers.contours) setSelectedContour(null);
    if (!layers.jmd) {
      setSelectedJmd(null);
    }

    const img = imageryRef.current;
    if (img.basemap) {
      img.basemap.show = layers.basemap;
      img.basemap.alpha = layers.opacity.basemap;
    }
    if (img.labels) {
      img.labels.show = layers.labels;
      img.labels.alpha = layers.opacity.labels;
    }
    viewer.scene.requestRender();
  }, [layers, viewerReady]);

  // 3D Slope Sensors Pins
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = window.Cesium;
    if (!viewer || !C) return;

    for (const ent of sensorEntitiesRef.current) viewer.entities.remove(ent);
    sensorEntitiesRef.current = [];

    if (layers.sensors) {
      DEFAULT_SENSORS.forEach((sensor) => {
        const isWarning = sensor.status === "warning";
        const pinColor = isWarning
          ? C.Color.fromCssColorString("#f59e0b")
          : C.Color.fromCssColorString("#2563eb");
        const opacity = layers.opacity.sensors;

        const ent = viewer.entities.add({
          position: C.Cartesian3.fromDegrees(
            sensor.lon,
            sensor.lat,
            sensor.alt - config.groundElevation + 15,
          ),
          point: {
            pixelSize: 10,
            color: pinColor.withAlpha(opacity),
            outlineColor: C.Color.WHITE.withAlpha(opacity),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${sensor.id}\n${sensor.value}`,
            font: "11px -apple-system, BlinkMacSystemFont, sans-serif",
            fillColor: C.Color.fromCssColorString("#0f172a").withAlpha(opacity),
            outlineColor: C.Color.WHITE.withAlpha(opacity),
            outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            backgroundColor: C.Color.fromCssColorString(
              "rgba(255, 255, 255, 0.92)",
            ).withAlpha(0.92 * opacity),
            showBackground: true,
            backgroundPadding: new C.Cartesian2(6, 4),
          },
        });
        sensorEntitiesRef.current.push(ent);
      });
    }
  }, [
    layers.sensors,
    layers.opacity.sensors,
    config.groundElevation,
    viewerReady,
  ]);

  // Orbit / Auto Cruise
  useEffect(() => {
    const viewer = viewerRef.current;
    const model = modelRef.current;
    const C = window.Cesium;
    if (!viewer || !C) return;

    if (orbitListenerRef.current) {
      orbitListenerRef.current();
      orbitListenerRef.current = null;
    }

    if (autoOrbit && model) {
      const removeCallback = viewer.clock.onTick.addEventListener(() => {
        viewer.camera.rotateRight(0.003);
      });
      orbitListenerRef.current = removeCallback;
    }

    return () => {
      if (orbitListenerRef.current) {
        orbitListenerRef.current();
        orbitListenerRef.current = null;
      }
    };
  }, [autoOrbit, viewerReady]);

  // Feature Picking (JMD buildings) when not in measure mode
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = window.Cesium;
    if (!viewer || !C || measureMode !== "none") return;

    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked && picked.id && picked.id.properties) {
        const props = picked.id.properties;
        const elevationVal =
          typeof props.elevation?.getValue === "function"
            ? props.elevation.getValue()
            : undefined;
        if (typeof elevationVal === "number") {
          const fid =
            typeof props.fid?.getValue === "function"
              ? props.fid.getValue()
              : undefined;
          const sourceId =
            typeof props.sourceId?.getValue === "function"
              ? props.sourceId.getValue()
              : undefined;
          setSelectedJmd(null);
          setSelectedContour({ elevation: elevationVal, fid, sourceId });
          return;
        }
        const idVal =
          typeof props.id?.getValue === "function"
            ? props.id.getValue()
            : undefined;
        const xmVal =
          typeof props.xm?.getValue === "function"
            ? props.xm.getValue()
            : undefined;
        const rsVal =
          typeof props.rs?.getValue === "function"
            ? props.rs.getValue()
            : undefined;
        const areaVal =
          typeof props.shape_area?.getValue === "function"
            ? props.shape_area.getValue()
            : undefined;
        const lenVal =
          typeof props.shape_length?.getValue === "function"
            ? props.shape_length.getValue()
            : undefined;

        if (idVal !== undefined || xmVal !== undefined) {
          setSelectedJmd({
            id: idVal,
            xm: xmVal,
            rs: rsVal,
            area: areaVal !== undefined ? Number(areaVal).toFixed(2) : "--",
            len: lenVal !== undefined ? Number(lenVal).toFixed(2) : "--",
          });
          setSelectedContour(null);
          return;
        }
      }
      setSelectedJmd(null);
      setSelectedContour(null);
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [measureMode, viewerReady]);

  // Preset Pitch & Heading
  useEffect(() => {
    const model = modelRef.current;
    const viewer = viewerRef.current;
    const C = window.Cesium;
    if (!model || !viewer || !C || !presetPitch) return;

    viewer.camera.flyToBoundingSphere(model.boundingSphere, {
      duration: 1.2,
      offset: new C.HeadingPitchRange(
        C.Math.toRadians(presetPitch.heading ?? 0),
        C.Math.toRadians(presetPitch.pitch),
        model.boundingSphere.radius * (presetPitch.pitch === -90 ? 2.5 : 2.8),
      ),
    });
  }, [presetPitch]);

  // Locate trigger
  useEffect(() => {
    const model = modelRef.current;
    const viewer = viewerRef.current;
    if (model && viewer) {
      const C = window.Cesium;
      viewer.camera.flyToBoundingSphere(model.boundingSphere, {
        duration: 1,
        offset: new C.HeadingPitchRange(
          0,
          C.Math.toRadians(-40),
          model.boundingSphere.radius * 2.8,
        ),
      });
    }
  }, [locate]);

  return (
    <>
      <div className="map-canvas" ref={container} />

      {selectedContour && layers.contours && (
        <div
          className="absolute bottom-4 left-4 z-20 w-52 rounded-xl border border-slate-200/90 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md"
          role="region"
          aria-label="等高线属性"
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
            <strong className="text-sm text-slate-800">〰 等高线属性</strong>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-700"
              onClick={() => setSelectedContour(null)}
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">高程</span>
            <strong className="text-amber-700">
              {selectedContour.elevation} m
            </strong>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">级别</span>
            <strong className="text-slate-700">
              {selectedContour.elevation % 20 === 0 ? "20m 主曲线" : "2m 曲线"}
            </strong>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500">要素 ID</span>
            <strong className="text-slate-700">
              {selectedContour.sourceId ?? selectedContour.fid ?? "--"}
            </strong>
          </div>
        </div>
      )}

      {/* Floating 3D Measure HUD */}
      {measureMode !== "none" && (
        <div className="measure-hud" role="region" aria-label="三维量测信息">
          {measureMode === "distance" && (
            <>
              <span>
                📐 空间测距：已选 <b>{measureInfo.pointsCount}</b> 点
              </span>
              {measureInfo.distance !== undefined && (
                <span>
                  直线距：
                  <b style={{ color: "#2563eb" }}>
                    {measureInfo.distance >= 1000
                      ? `${(measureInfo.distance / 1000).toFixed(2)} km`
                      : `${measureInfo.distance.toFixed(1)} m`}
                  </b>
                  {measureInfo.heightDiff !== undefined && (
                    <span style={{ marginLeft: "8px", color: "#64748b" }}>
                      (高差: {measureInfo.heightDiff.toFixed(1)}m)
                    </span>
                  )}
                </span>
              )}
            </>
          )}

          {measureMode === "height" && (
            <>
              <span>
                ⛰️ 高差测量：已选 <b>{measureInfo.pointsCount}</b> / 2 点
              </span>
              {measureInfo.heightDiff !== undefined && (
                <span>
                  垂直落差：
                  <b style={{ color: "#f59e0b", fontSize: "14px" }}>
                    {measureInfo.heightDiff.toFixed(2)} m
                  </b>
                </span>
              )}
            </>
          )}

          {measureMode === "coordinate" && (
            <>
              <span>📍 空间坐标探测</span>
              {measureInfo.coord ? (
                <span>
                  经度:{" "}
                  <b style={{ color: "#2563eb" }}>{measureInfo.coord.lon}°</b>{" "}
                  纬度:{" "}
                  <b style={{ color: "#2563eb" }}>{measureInfo.coord.lat}°</b>{" "}
                  海拔:{" "}
                  <b style={{ color: "#2563eb" }}>{measureInfo.coord.alt} m</b>
                </span>
              ) : (
                <span style={{ color: "#64748b" }}>在模型表面点击拾取点</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Floating 3D Selected JMD Card */}
      {selectedJmd && layers.jmd && (
        <div
          className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-3.5 shadow-xl w-64 text-xs"
          role="region"
          aria-label="居民地要素详情"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
              <span>🏠</span>
              <span>居民地要素 #{selectedJmd.id ?? ""}</span>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              onClick={() => setSelectedJmd(null)}
              title="关闭"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 text-slate-600">
            <div className="flex justify-between items-center">
              <span>项目标识</span>
              <span className="font-semibold text-slate-800">
                {selectedJmd.xm || "--"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>常住人口</span>
              <span className="font-semibold text-blue-600">
                {selectedJmd.rs ?? 0} 人
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>建筑面积</span>
              <span className="font-semibold text-slate-800">
                {selectedJmd.area} ㎡
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>轮廓周长</span>
              <span className="font-semibold text-slate-800">
                {selectedJmd.len} m
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
