import { useEffect, useRef, useState, type RefObject } from "react";
import type * as Cesium from "cesium";

import type { MapTool } from "./types";

export type MeasureInfo = {
  pointsCount: number;
  distance?: number;
  heightDiff?: number;
  coord?: { lon: number; lat: number; alt: number };
};

export function useCesiumMeasurement(
  viewerRef: RefObject<Cesium.Viewer | null>,
  mode: MapTool,
  clearTrigger: number,
) {
  const entitiesRef = useRef<Cesium.Entity[]>([]);
  const [info, setInfo] = useState<MeasureInfo>({ pointsCount: 0 });

  useEffect(() => {
    const viewer = viewerRef.current;
    const C = window.Cesium;
    if (!viewer || !C || mode === "navigate" || mode === "query") {
      setInfo({ pointsCount: 0 });
      return;
    }

    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    const points: Cesium.Cartesian3[] = [];

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      let position: Cesium.Cartesian3 | undefined = viewer.scene.pickPosition(
        click.position,
      );
      if (!position) {
        const ray = viewer.camera.getPickRay(click.position);
        position = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
      }
      if (!position) return;

      const cartographic = C.Cartographic.fromCartesian(position);
      const lon = Number(C.Math.toDegrees(cartographic.longitude).toFixed(6));
      const lat = Number(C.Math.toDegrees(cartographic.latitude).toFixed(6));
      const alt = Number(cartographic.height.toFixed(1));

      if (mode === "coordinate") {
        setInfo({ pointsCount: 1, coord: { lon, lat, alt } });
        entitiesRef.current.push(
          viewer.entities.add({
            position,
            point: pointStyle(C, "#2563eb"),
            label: labelStyle(
              C,
              `坐标探测点\n经度: ${lon}°\n纬度: ${lat}°\n海拔: ${alt}m`,
            ),
          }),
        );
        return;
      }

      points.push(position);
      entitiesRef.current.push(
        viewer.entities.add({
          position,
          point: pointStyle(C, mode === "height" ? "#f59e0b" : "#2563eb"),
        }),
      );

      if (mode === "distance") {
        if (points.length < 2) {
          setInfo({ pointsCount: 1 });
          return;
        }
        const first = points.at(-2)!;
        const second = points.at(-1)!;
        const distance = C.Cartesian3.distance(first, second);
        const firstHeight = C.Cartographic.fromCartesian(first).height;
        const secondHeight = C.Cartographic.fromCartesian(second).height;
        const heightDiff = Math.abs(secondHeight - firstHeight);
        setInfo({ pointsCount: points.length, distance, heightDiff });
        addLine(
          C,
          viewer,
          entitiesRef.current,
          first,
          second,
          "#2563eb",
          `空间距: ${distance.toFixed(1)}m | 高差: ${heightDiff.toFixed(1)}m`,
        );
        return;
      }

      if (points.length < 2) {
        setInfo({ pointsCount: 1 });
        return;
      }
      const first = points[0];
      const second = points[1];
      const firstHeight = C.Cartographic.fromCartesian(first).height;
      const secondCartographic = C.Cartographic.fromCartesian(second);
      const heightDiff = Math.abs(secondCartographic.height - firstHeight);
      const verticalBase = C.Cartesian3.fromRadians(
        secondCartographic.longitude,
        secondCartographic.latitude,
        firstHeight,
      );
      setInfo({ pointsCount: 2, heightDiff });
      addLine(
        C,
        viewer,
        entitiesRef.current,
        verticalBase,
        second,
        "#f59e0b",
        `垂直高差: ${heightDiff.toFixed(2)} m`,
      );
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [mode, clearTrigger, viewerRef]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const entity of entitiesRef.current) viewer.entities.remove(entity);
    entitiesRef.current = [];
    setInfo({ pointsCount: 0 });
  }, [clearTrigger, viewerRef]);

  return info;
}

function pointStyle(C: typeof Cesium, color: string) {
  return {
    pixelSize: 8,
    color: C.Color.fromCssColorString(color),
    outlineColor: C.Color.WHITE,
    outlineWidth: 2,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function labelStyle(C: typeof Cesium, text: string) {
  return {
    text,
    font: "11px monospace",
    fillColor: C.Color.fromCssColorString("#0f172a"),
    showBackground: true,
    backgroundColor: C.Color.fromCssColorString("rgba(255, 255, 255, 0.95)"),
    backgroundPadding: new C.Cartesian2(6, 4),
    verticalOrigin: C.VerticalOrigin.BOTTOM,
    pixelOffset: new C.Cartesian2(0, -10),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function addLine(
  C: typeof Cesium,
  viewer: Cesium.Viewer,
  entities: Cesium.Entity[],
  first: Cesium.Cartesian3,
  second: Cesium.Cartesian3,
  color: string,
  text: string,
) {
  entities.push(
    viewer.entities.add({
      polyline: {
        positions: [first, second],
        width: 3,
        material: new C.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: C.Color.fromCssColorString(color),
        }),
      },
    }),
  );
  entities.push(
    viewer.entities.add({
      position: C.Cartesian3.midpoint(first, second, new C.Cartesian3()),
      label: labelStyle(C, text),
    }),
  );
}
