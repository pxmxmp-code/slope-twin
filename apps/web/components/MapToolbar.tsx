import {
  Crosshair,
  Hand,
  Info,
  Mountain,
  Navigation2,
  Orbit,
  Ruler,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { MapTool, PresetPitch, Telemetry, ViewMode } from "./types";

type Props = {
  mode: ViewMode;
  telemetry: Telemetry;
  activeTool: MapTool;
  autoOrbit: boolean;
  onToolChange: (tool: MapTool) => void;
  onPresetPitch: (pitch: PresetPitch) => void;
  onZoom: (direction: "in" | "out") => void;
  onToggleOrbit: () => void;
  onClear: () => void;
};

export function MapToolbar({
  mode,
  telemetry,
  activeTool,
  autoOrbit,
  onToolChange,
  onPresetPitch,
  onZoom,
  onToggleOrbit,
  onClear,
}: Props) {
  const toggleTool = (next: MapTool) =>
    onToolChange(activeTool === next ? "navigate" : next);

  const headingVal = Math.round(telemetry.heading ?? 0);
  // Normalized heading 0-359
  const normalizedHeading = ((headingVal % 360) + 360) % 360;

  return (
    <div className="gis-toolbox" role="toolbar" aria-label="地图通用工具">
      <div className="gis-btn-group" aria-label="交互工具">
        <button
          type="button"
          className={`gis-btn ${activeTool === "navigate" ? "active" : ""}`}
          title="漫游平移（默认）"
          aria-label="漫游平移"
          aria-pressed={activeTool === "navigate"}
          onClick={() => onToolChange("navigate")}
        >
          <Hand className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={`gis-btn ${activeTool === "query" ? "active" : ""}`}
          title="要素属性查询（点击启用）"
          aria-label="要素属性查询"
          aria-pressed={activeTool === "query"}
          onClick={() => toggleTool("query")}
        >
          <Info className="w-4 h-4" />
        </button>
        <div className="w-5 h-px bg-white/10 mx-auto my-0.5" />
        <button
          type="button"
          className="gis-btn"
          title="放大"
          aria-label="放大"
          onClick={() => onZoom("in")}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="gis-btn"
          title="缩小"
          aria-label="缩小"
          onClick={() => onZoom("out")}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Group 1: 视角、罗盘与巡检 */}
      <div className="gis-btn-group" title="视点导航与航向">
        {/* Modern Compass with Dual-Color Needle */}
        <button
          type="button"
          className="gis-btn group"
          title={`当前航向 ${normalizedHeading}° · 点击复位正北`}
          onClick={() =>
            onPresetPitch({
              pitch: mode === "2d" ? 0 : -45,
              heading: 0,
              trigger: Date.now(),
            })
          }
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-150 relative"
            style={{ transform: `rotate(${-normalizedHeading}deg)` }}
          >
            {/* North Red Pointer / South Light Pointer */}
            <Navigation2 className="w-4 h-4 text-red-500 fill-red-500 stroke-red-600" />
            <span className="absolute -top-1 text-[7px] font-mono font-bold text-red-400">
              N
            </span>
          </div>
        </button>

        <div className="w-5 h-px bg-white/10 mx-auto my-0.5" />

        {/* 90° Top-down View */}
        <button
          type="button"
          className="gis-btn text-[11px] font-mono font-bold hover:text-sky-400"
          title="90° 垂直俯视"
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

        {/* 45° Bird's Eye View */}
        <button
          type="button"
          className="gis-btn text-[11px] font-mono font-bold hover:text-sky-400"
          title="45° 鸟瞰透视"
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
            {/* 0° Ground Level View */}
            <button
              type="button"
              className="gis-btn text-[11px] font-mono font-bold hover:text-sky-400"
              title="0° 贴地平视"
              onClick={() => onPresetPitch({ pitch: -5, trigger: Date.now() })}
            >
              0°
            </button>

            <div className="w-5 h-px bg-white/10 mx-auto my-0.5" />

            {/* 360° Auto Orbit Cruise */}
            <button
              type="button"
              className={`gis-btn ${
                autoOrbit
                  ? "bg-sky-500 text-white shadow-[0_0_14px_rgba(56,189,248,0.7)] ring-1 ring-sky-300"
                  : ""
              }`}
              title={
                autoOrbit ? "停止 360° 环绕巡航" : "启动 360° 自动环视巡检"
              }
              onClick={onToggleOrbit}
            >
              <Orbit
                className={`w-4 h-4 ${autoOrbit ? "animate-spin text-white" : ""}`}
              />
            </button>
          </>
        )}
      </div>

      {/* Group 2: 空间量测工具箱 */}
      <div className="gis-btn-group" title="空间量测工具">
        {/* Distance Measurement */}
        <button
          type="button"
          className={`gis-btn ${
            activeTool === "distance"
              ? "active bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]"
              : ""
          }`}
          title="空间直线与水平测距"
          aria-pressed={activeTool === "distance"}
          onClick={() => toggleTool("distance")}
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Height Difference (3D only) */}
        {mode === "3d" && (
          <button
            type="button"
            className={`gis-btn ${
              activeTool === "height"
                ? "active bg-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                : ""
            }`}
            title="垂直落差与高差测量"
            aria-pressed={activeTool === "height"}
            onClick={() => toggleTool("height")}
          >
            <Mountain className="w-4 h-4" />
          </button>
        )}

        {/* Coordinate Picker */}
        <button
          type="button"
          className={`gis-btn ${
            activeTool === "coordinate"
              ? "active bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.6)]"
              : ""
          }`}
          title="空间坐标拾取"
          aria-pressed={activeTool === "coordinate"}
          onClick={() => toggleTool("coordinate")}
        >
          <Crosshair className="w-4 h-4" />
        </button>

        <div className="w-5 h-px bg-white/10 mx-auto my-0.5" />
        <button
          type="button"
          className="gis-btn text-rose-400 hover:text-white hover:bg-rose-500/30 transition-colors"
          title="清除查询与量测结果"
          aria-label="清除查询与量测结果"
          onClick={onClear}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
