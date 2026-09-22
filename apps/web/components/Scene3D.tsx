"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type * as Cesium from "cesium";
import {
  CARTO_DARK_LABELS,
  CARTO_DARK_TILES,
  CARTO_LIGHT_LABELS,
  CARTO_LIGHT_TILES,
  DEFAULT_SENSORS,
  tiandituUrl,
  type ViewProps,
} from "./types";

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
    light?: Cesium.ImageryLayer;
    lightLabels?: Cesium.ImageryLayer;
    dark?: Cesium.ImageryLayer;
    darkLabels?: Cesium.ImageryLayer;
    basemap?: Cesium.ImageryLayer;
    satellite?: Cesium.ImageryLayer;
    labels?: Cesium.ImageryLayer;
  }>({});
  const latestLayers = useRef(layers);
  latestLayers.current = layers;

  const measureEntitiesRef = useRef<Cesium.Entity[]>([]);
  const sensorEntitiesRef = useRef<Cesium.Entity[]>([]);
  const orbitListenerRef = useRef<(() => void) | null>(null);

  const jmdDataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const [selectedJmd, setSelectedJmd] = useState<{
    id?: number;
    xm?: string;
    rs?: number;
    area?: string;
    len?: string;
  } | null>(null);

  const [measureInfo, setMeasureInfo] = useState<{
    pointsCount: number;
    distance?: number;
    heightDiff?: number;
    coord?: { lon: number; lat: number; alt: number };
  }>({ pointsCount: 0 });

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onTelemetryChangeRef = useRef(onTelemetryChange);
  onTelemetryChangeRef.current = onTelemetryChange;

  useEffect(() => {
    let disposed = false;
    let viewer: Cesium.Viewer | undefined;

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

        // 1. Light Basemap (Carto Light)
        const lightProvider = new C.UrlTemplateImageryProvider({
          url: CARTO_LIGHT_TILES,
          maximumLevel: 19,
        });
        const lightLayer =
          viewer.imageryLayers.addImageryProvider(lightProvider);
        lightLayer.show = layers.basemap && layers.basemapType === "light";
        imageryRef.current.light = lightLayer;

        const lightLabelsProvider = new C.UrlTemplateImageryProvider({
          url: CARTO_LIGHT_LABELS,
          maximumLevel: 19,
        });
        const lightLabelsLayer =
          viewer.imageryLayers.addImageryProvider(lightLabelsProvider);
        lightLabelsLayer.show = layers.labels && layers.basemapType === "light";
        imageryRef.current.lightLabels = lightLabelsLayer;

        // Dark Basemap
        const darkProvider = new C.UrlTemplateImageryProvider({
          url: CARTO_DARK_TILES,
          maximumLevel: 19,
        });
        const darkLayer = viewer.imageryLayers.addImageryProvider(darkProvider);
        darkLayer.show = layers.basemap && layers.basemapType === "dark";
        imageryRef.current.dark = darkLayer;

        const darkLabelsProvider = new C.UrlTemplateImageryProvider({
          url: CARTO_DARK_LABELS,
          maximumLevel: 19,
        });
        const darkLabelsLayer =
          viewer.imageryLayers.addImageryProvider(darkLabelsProvider);
        darkLabelsLayer.show = layers.labels && layers.basemapType === "dark";
        imageryRef.current.darkLabels = darkLabelsLayer;

        // 2. Tianditu Vector & Satellite Basemap
        if (config.tiandituToken) {
          const vecProvider = new C.UrlTemplateImageryProvider({
            url: tiandituUrl("vec", config.tiandituToken),
            maximumLevel: 18,
            credit: "© 天地图",
          });
          const vecLayer = viewer.imageryLayers.addImageryProvider(vecProvider);
          vecLayer.show = layers.basemap && layers.basemapType === "vector";
          imageryRef.current.basemap = vecLayer;

          const satProvider = new C.UrlTemplateImageryProvider({
            url: tiandituUrl("img", config.tiandituToken),
            maximumLevel: 18,
            credit: "© 天地图影像",
          });
          const satLayer = viewer.imageryLayers.addImageryProvider(satProvider);
          satLayer.show = layers.basemap && layers.basemapType === "satellite";
          imageryRef.current.satellite = satLayer;

          const cvaProvider = new C.UrlTemplateImageryProvider({
            url: tiandituUrl("cva", config.tiandituToken),
            maximumLevel: 18,
            credit: "© 天地图注记",
          });
          const cvaLayer = viewer.imageryLayers.addImageryProvider(cvaProvider);
          cvaLayer.show =
            layers.labels &&
            (layers.basemapType === "vector" ||
              layers.basemapType === "satellite");
          imageryRef.current.labels = cvaLayer;
        }

        // 3. Load 3D Tileset
        const model = await C.Cesium3DTileset.fromUrl(config.tilesetUrl, {
          maximumScreenSpaceError: 16,
          cacheBytes: 512 * 1024 * 1024,
        });

        if (disposed) {
          model.destroy();
          return;
        }

        viewer.scene.primitives.add(model);
        modelRef.current = model;
        model.show = latestLayers.current.model;

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
                    C.Color.fromCssColorString("#3b82f6").withAlpha(0.55),
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
      if (orbitListenerRef.current) {
        orbitListenerRef.current();
        orbitListenerRef.current = null;
      }
      if (jmdDataSourceRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.dataSources.remove(jmdDataSourceRef.current, true);
        } catch {}
      }
      jmdDataSourceRef.current = null;
      modelRef.current = null;
      viewerRef.current = null;
      imageryRef.current = {};
      measureEntitiesRef.current = [];
      sensorEntitiesRef.current = [];
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [
    config.tilesetUrl,
    config.tiandituToken,
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
      (model as unknown as { debugWireframe?: boolean }).debugWireframe =
        layers.wireframe;
      model.style = undefined;
    }

    if (jmdDataSourceRef.current) {
      jmdDataSourceRef.current.show = layers.jmd;
    }
    if (!layers.jmd) {
      setSelectedJmd(null);
    }

    const img = imageryRef.current;
    if (img.light)
      img.light.show = layers.basemap && layers.basemapType === "light";
    if (img.lightLabels)
      img.lightLabels.show = layers.labels && layers.basemapType === "light";
    if (img.dark)
      img.dark.show = layers.basemap && layers.basemapType === "dark";
    if (img.darkLabels)
      img.darkLabels.show = layers.labels && layers.basemapType === "dark";
    if (img.basemap)
      img.basemap.show = layers.basemap && layers.basemapType === "vector";
    if (img.satellite)
      img.satellite.show = layers.basemap && layers.basemapType === "satellite";
    if (img.labels)
      img.labels.show =
        layers.labels &&
        (layers.basemapType === "vector" || layers.basemapType === "satellite");

    viewer.scene.globe.enableLighting = layers.enableSun;
    viewer.shadows = layers.enableShadows;

    viewer.scene.fog.enabled = layers.enableAtmosphere;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = layers.enableAtmosphere;
    }

    if (viewer.scene.postProcessStages?.bloom) {
      viewer.scene.postProcessStages.bloom.enabled = layers.enableBloom;
    }

    viewer.scene.globe.depthTestAgainstTerrain = layers.enableDepthTest;
    viewer.scene.requestRender();
  }, [layers]);

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

        const ent = viewer.entities.add({
          position: C.Cartesian3.fromDegrees(
            sensor.lon,
            sensor.lat,
            sensor.alt + 15,
          ),
          point: {
            pixelSize: 10,
            color: pinColor,
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${sensor.id}\n${sensor.value}`,
            font: "11px -apple-system, BlinkMacSystemFont, sans-serif",
            fillColor: C.Color.fromCssColorString("#0f172a"),
            outlineColor: C.Color.WHITE,
            outlineWidth: 3,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -12),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            backgroundColor: C.Color.fromCssColorString(
              "rgba(255, 255, 255, 0.92)",
            ),
            showBackground: true,
            backgroundPadding: new C.Cartesian2(6, 4),
          },
        });
        sensorEntitiesRef.current.push(ent);
      });
    }
  }, [layers.sensors]);

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
  }, [autoOrbit]);

  // Interactive 3D Measurement & Picking
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = window.Cesium;
    if (!viewer || !C) return;

    if (measureMode === "none") {
      setMeasureInfo({ pointsCount: 0 });
      return;
    }

    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    const recordedPoints: Cesium.Cartesian3[] = [];

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      let position: Cesium.Cartesian3 | undefined = viewer.scene.pickPosition(
        click.position,
      );
      if (!position) {
        const ray = viewer.camera.getPickRay(click.position);
        if (ray) {
          const globePos = viewer.scene.globe.pick(ray, viewer.scene);
          if (globePos) position = globePos;
        }
      }
      if (!position) return;

      const carto = C.Cartographic.fromCartesian(position);
      const lon = Number(C.Math.toDegrees(carto.longitude).toFixed(6));
      const lat = Number(C.Math.toDegrees(carto.latitude).toFixed(6));
      const alt = Number(carto.height.toFixed(1));

      if (measureMode === "coordinate") {
        setMeasureInfo({
          pointsCount: 1,
          coord: { lon, lat, alt },
        });

        const ent = viewer.entities.add({
          position,
          point: {
            pixelSize: 8,
            color: C.Color.fromCssColorString("#2563eb"),
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `坐标探测点\n经度: ${lon}°\n纬度: ${lat}°\n海拔: ${alt}m`,
            font: "11px monospace",
            fillColor: C.Color.fromCssColorString("#0f172a"),
            showBackground: true,
            backgroundColor: C.Color.fromCssColorString(
              "rgba(255, 255, 255, 0.95)",
            ),
            backgroundPadding: new C.Cartesian2(6, 4),
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        measureEntitiesRef.current.push(ent);
      }

      if (measureMode === "distance") {
        recordedPoints.push(position);

        const ptEnt = viewer.entities.add({
          position,
          point: {
            pixelSize: 7,
            color: C.Color.WHITE,
            outlineColor: C.Color.fromCssColorString("#2563eb"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        measureEntitiesRef.current.push(ptEnt);

        if (recordedPoints.length >= 2) {
          const p1 = recordedPoints[recordedPoints.length - 2];
          const p2 = recordedPoints[recordedPoints.length - 1];
          const dist = C.Cartesian3.distance(p1, p2);

          const c1 = C.Cartographic.fromCartesian(p1);
          const c2 = C.Cartographic.fromCartesian(p2);
          const hDiff = Math.abs(c2.height - c1.height);

          setMeasureInfo({
            pointsCount: recordedPoints.length,
            distance: dist,
            heightDiff: hDiff,
          });

          const lineEnt = viewer.entities.add({
            polyline: {
              positions: [p1, p2],
              width: 3,
              material: new C.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: C.Color.fromCssColorString("#2563eb"),
              }),
            },
          });
          measureEntitiesRef.current.push(lineEnt);

          const mid = C.Cartesian3.midpoint(p1, p2, new C.Cartesian3());
          const labelEnt = viewer.entities.add({
            position: mid,
            label: {
              text: `空间距: ${dist.toFixed(1)}m | 高差: ${hDiff.toFixed(1)}m`,
              font: "11px monospace",
              fillColor: C.Color.fromCssColorString("#0f172a"),
              showBackground: true,
              backgroundColor: C.Color.fromCssColorString(
                "rgba(255, 255, 255, 0.95)",
              ),
              backgroundPadding: new C.Cartesian2(6, 4),
              verticalOrigin: C.VerticalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          measureEntitiesRef.current.push(labelEnt);
        } else {
          setMeasureInfo({ pointsCount: 1 });
        }
      }

      if (measureMode === "height") {
        recordedPoints.push(position);
        const ptEnt = viewer.entities.add({
          position,
          point: {
            pixelSize: 7,
            color: C.Color.fromCssColorString("#f59e0b"),
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        measureEntitiesRef.current.push(ptEnt);

        if (recordedPoints.length >= 2) {
          const p1 = recordedPoints[0];
          const p2 = recordedPoints[1];
          const c1 = C.Cartographic.fromCartesian(p1);
          const c2 = C.Cartographic.fromCartesian(p2);
          const hDiff = Math.abs(c2.height - c1.height);

          setMeasureInfo({
            pointsCount: 2,
            heightDiff: hDiff,
          });

          const p2Vertical = C.Cartesian3.fromRadians(
            c2.longitude,
            c2.latitude,
            c1.height,
          );

          const hLine = viewer.entities.add({
            polyline: {
              positions: [p2Vertical, p2],
              width: 3,
              material: new C.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: C.Color.fromCssColorString("#f59e0b"),
              }),
            },
          });
          measureEntitiesRef.current.push(hLine);

          const labelEnt = viewer.entities.add({
            position: C.Cartesian3.midpoint(p2Vertical, p2, new C.Cartesian3()),
            label: {
              text: `垂直高差: ${hDiff.toFixed(2)} m`,
              font: "12px monospace",
              fillColor: C.Color.fromCssColorString("#b45309"),
              showBackground: true,
              backgroundColor: C.Color.fromCssColorString(
                "rgba(255, 255, 255, 0.95)",
              ),
              backgroundPadding: new C.Cartesian2(8, 4),
              verticalOrigin: C.VerticalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          measureEntitiesRef.current.push(labelEnt);
        } else {
          setMeasureInfo({ pointsCount: 1 });
        }
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [measureMode]);

  // Clear measure
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const ent of measureEntitiesRef.current) viewer.entities.remove(ent);
    measureEntitiesRef.current = [];
    setMeasureInfo({ pointsCount: 0 });
  }, [clearMeasureTrigger]);

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
          return;
        }
      }
      setSelectedJmd(null);
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [measureMode]);

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
          className="absolute top-16 right-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-3.5 shadow-xl w-64 text-xs"
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
