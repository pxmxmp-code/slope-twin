import { Compass, Crosshair, Mountain, RotateCw, Ruler } from "lucide-react";

import type { MeasureType, PresetPitch, Telemetry, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  telemetry: Telemetry;
  measureMode: MeasureType;
  autoOrbit: boolean;
  onMeasureMode: (mode: MeasureType) => void;
  onPresetPitch: (pitch: PresetPitch) => void;
  onToggleOrbit: () => void;
  onClearMeasure: () => void;
};

export function MapToolbar({
  mode,
  telemetry,
  measureMode,
  autoOrbit,
  onMeasureMode,
  onPresetPitch,
  onToggleOrbit,
  onClearMeasure,
}: Props) {
  const toggleMeasure = (next: MeasureType) =>
    onMeasureMode(measureMode === next ? "none" : next);

  return (
    <div className="gis-toolbox">
      <div className="gis-btn-group" title="视角与罗盘">
        <button
          type="button"
          className="gis-btn"
          title="指北针"
          onClick={() =>
            onPresetPitch({
              pitch: mode === "2d" ? 0 : -45,
              heading: 0,
              trigger: Date.now(),
            })
          }
        >
          <Compass
            className="w-4 h-4 text-blue-600 compass-dial"
            style={{ transform: `rotate(${-(telemetry.heading ?? 0)}deg)` }}
          />
        </button>
        <button
          type="button"
          className="gis-btn text-xs font-mono font-semibold"
          title="垂直俯视"
          onClick={() =>
            onPresetPitch({
              pitch: mode === "2d" ? 0 : -90,
              heading: 0,
              trigger: Date.now(),
            })
          }
        >
          90°
        </button>
        <button
          type="button"
          className="gis-btn text-xs font-mono font-semibold"
          title="鸟瞰透视"
          onClick={() =>
            onPresetPitch({
              pitch: mode === "2d" ? 45 : -40,
              trigger: Date.now(),
            })
          }
        >
          45°
        </button>
        {mode === "3d" && (
          <>
            <button
              type="button"
              className="gis-btn text-xs font-mono font-semibold"
              title="地面平视"
              onClick={() => onPresetPitch({ pitch: -5, trigger: Date.now() })}
            >
              0°
            </button>
            <button
              type="button"
              className={`gis-btn ${autoOrbit ? "active" : ""}`}
              title={autoOrbit ? "停止巡航" : "一键 360° 环视巡检"}
              onClick={onToggleOrbit}
            >
              <RotateCw
                className={`w-4 h-4 ${autoOrbit ? "animate-spin" : ""}`}
              />
            </button>
          </>
        )}
      </div>

      <div className="gis-btn-group" title="空间测量">
        <button
          type="button"
          className={`gis-btn ${measureMode === "distance" ? "active" : ""}`}
          title="空间测距"
          onClick={() => toggleMeasure("distance")}
        >
          <Ruler className="w-4 h-4" />
        </button>
        {mode === "3d" && (
          <button
            type="button"
            className={`gis-btn ${measureMode === "height" ? "active" : ""}`}
            title="高差测量"
            onClick={() => toggleMeasure("height")}
          >
            <Mountain className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          className={`gis-btn ${measureMode === "coordinate" ? "active" : ""}`}
          title="坐标拾取"
          onClick={() => toggleMeasure("coordinate")}
        >
          <Crosshair className="w-4 h-4" />
        </button>
        {measureMode !== "none" && (
          <button
            type="button"
            className="gis-btn text-xs text-red-500 font-bold hover:bg-red-50"
            title="清除测量记录"
            onClick={onClearMeasure}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
