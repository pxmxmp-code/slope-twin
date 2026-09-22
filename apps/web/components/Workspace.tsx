"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  Compass,
  Crosshair,
  Layers as LayersIcon,
  Maximize2,
  Minimize2,
  Mountain,
  Navigation,
  RotateCw,
  Ruler,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  type Layers,
  type MeasureType,
  type PresetPitch,
  type SceneConfig,
  type SlopeSensor,
  type Telemetry,
} from "./types";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const Map2D = dynamic(() => import("./Map2D"), { ssr: false });
const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });

export default function Workspace() {
  const [config, setConfig] = useState<SceneConfig | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [showLayerPanel, setShowLayerPanel] = useState(true);

  // Layers State
  const [layers, setLayers] = useState<Layers>({
    basemap: true,
    labels: true,
    dom: true,
    model: true,
    opacity: 1,
    basemapType: "light",
    sensors: true,
    jmd: true,
    wireframe: false,
    visualMode: "natural",
    enableSun: false,
    enableShadows: false,
    enableAtmosphere: true,
    enableBloom: false,
    enableDepthTest: true,
  });

  // Tools & Navigation State
  const [locate, setLocate] = useState(0);
  const [status, setStatus] = useState("正在连接服务…");
  const [measureMode, setMeasureMode] = useState<MeasureType>("none");
  const [clearMeasureTrigger, setClearMeasureTrigger] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [presetPitch, setPresetPitch] = useState<PresetPitch | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<SlopeSensor | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live Telemetry
  const [telemetry, setTelemetry] = useState<Telemetry>({
    lon: 98.88215,
    lat: 27.05023,
    alt: 1850,
    zoom: 16.5,
    pitch: 0,
    heading: 0,
  });

  const handleTelemetryChange = useCallback((t: Partial<Telemetry>) => {
    setTelemetry((prev) => ({ ...prev, ...t }));
  }, []);

  // Fetch Config
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("无法连接地图服务，请确认 FastAPI 已启动，然后刷新页面。");
      });
    return () => controller.abort();
  }, []);

  // Fullscreen Handler
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  function toggle(key: keyof Layers) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  function layerRow(
    key: keyof Layers,
    name: string,
    description: string,
    disabled = false,
  ) {
    return (
      <label
        htmlFor={`layer-${key}`}
        className={`layer-row ${disabled ? "disabled" : ""}`}
      >
        <div>
          <strong>{name}</strong>
          <small>{description}</small>
        </div>
        <Switch
          id={`layer-${key}`}
          aria-label={name}
          checked={Boolean(layers[key])}
          disabled={disabled}
          onCheckedChange={() => toggle(key)}
        />
      </label>
    );
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        setMode(value as "2d" | "3d");
        setStatus("正在切换视图…");
        setAutoOrbit(false);
        setMeasureMode("none");
      }}
      asChild
    >
      <main className="workspace">
        {/* Top Header Bar */}
        <header className="header">
          {/* Brand Logo & Name */}
          <div className="brand">
            <div className="brand-icon">
              <Mountain className="w-5 h-5" />
            </div>
            <div>
              <h1>边坡数字孪生系统</h1>
              <p>SLOPE TWIN</p>
            </div>
          </div>

          {/* Centered 2D / 3D Switcher */}
          <TabsList className="mode-switch" aria-label="视图切换">
            <TabsTrigger value="2d">
              <span>二维地图</span>
            </TabsTrigger>
            <TabsTrigger value="3d">
              <span>三维实景</span>
            </TabsTrigger>
          </TabsList>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`h-8 px-2.5 text-xs font-medium border-slate-200 transition-all ${
                showLayerPanel
                  ? "bg-blue-50 text-blue-600 border-blue-200"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setShowLayerPanel(!showLayerPanel)}
              title={showLayerPanel ? "隐藏图层控制" : "展开图层控制"}
            >
              <LayersIcon className="w-3.5 h-3.5 mr-1" />
              图层
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs font-medium border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              disabled={!config}
              onClick={() => setLocate((value) => value + 1)}
              title="定位项目范围"
            >
              <Navigation className="w-3.5 h-3.5 mr-1" />
              定位
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title={isFullscreen ? "退出全屏" : "全屏"}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        {/* Viewport Canvas with Floating HUD */}
        <section className="body">
          <TabsContent
            value={mode}
            className="viewport m-0"
            aria-label={mode === "2d" ? "二维地图视窗" : "三维模型视窗"}
          >
            {error ? (
              <div className="empty-state" role="alert">
                <div className="empty-icon text-red-500 bg-red-50">⚠️</div>
                <h2>无法连接地图服务</h2>
                <p>{error}</p>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  重新连接
                </Button>
              </div>
            ) : config ? (
              mode === "2d" ? (
                <Map2D
                  config={config}
                  layers={layers}
                  locate={locate}
                  measureMode={measureMode}
                  clearMeasureTrigger={clearMeasureTrigger}
                  presetPitch={presetPitch}
                  onStatus={setStatus}
                  onTelemetryChange={handleTelemetryChange}
                  onSensorSelect={setSelectedSensor}
                  selectedSensor={selectedSensor}
                />
              ) : (
                <Scene3D
                  config={config}
                  layers={layers}
                  locate={locate}
                  measureMode={measureMode}
                  clearMeasureTrigger={clearMeasureTrigger}
                  autoOrbit={autoOrbit}
                  presetPitch={presetPitch}
                  onStatus={setStatus}
                  onTelemetryChange={handleTelemetryChange}
                  onSensorSelect={setSelectedSensor}
                  selectedSensor={selectedSensor}
                />
              )
            ) : (
              <div className="empty-state">
                <div className="empty-icon">⏳</div>
                <h2>正在连接地图服务…</h2>
              </div>
            )}

            {/* Top Center Caption */}
            <div className="view-caption">
              <span className="live-dot" />
              <span>{mode === "2d" ? "二维地图模式" : "三维实景模式"}</span>
            </div>

            {/* Clean Floating Layer Control Panel (Directly suspended on the map) */}
            {showLayerPanel ? (
              <div className="floating-layer-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                    <span>图层控制</span>
                  </div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
                    title="收起图层"
                    onClick={() => setShowLayerPanel(false)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="panel-body">
                  <div className="section-label">图层开关</div>
                  {layerRow(
                    "basemap",
                    "天地图电子地图",
                    "基础地理背景",
                    !config?.tiandituToken &&
                      layers.basemapType !== "light" &&
                      layers.basemapType !== "dark",
                  )}
                  {layerRow(
                    "labels",
                    "中文注记",
                    "地名与道路名称",
                    !config?.tiandituToken &&
                      layers.basemapType !== "light" &&
                      layers.basemapType !== "dark",
                  )}
                  {layerRow("jmd", "JMD 居民地要素", "建筑物与居住区范围矢量")}

                  {mode === "2d" ? (
                    <>
                      {layerRow("dom", "DOM 正射影像", "航测遥感影像")}
                      <div className="opacity">
                        <span>
                          影像透明度{" "}
                          <b>{Math.round((1 - layers.opacity) * 100)}%</b>
                        </span>
                        <Slider
                          className="mt-3"
                          aria-label="影像透明度"
                          min={0}
                          max={100}
                          step={1}
                          value={[Math.round((1 - layers.opacity) * 100)]}
                          disabled={!layers.dom}
                          onValueChange={([value]) =>
                            setLayers((current) => ({
                              ...current,
                              opacity: 1 - value / 100,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    layerRow("model", "三维实景模型", "倾斜摄影 3D Tiles")
                  )}

                  {layerRow("sensors", "边坡监测点位", "现场传感器位置")}

                  {config && !config.tiandituToken && (
                    <p className="notice">
                      天地图密钥未配置，已使用浅色高精底图。
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full px-3.5 py-1.5 shadow-md text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
                onClick={() => setShowLayerPanel(true)}
                title="展开图层控制"
              >
                <LayersIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>展开图层</span>
              </button>
            )}

            {/* Floating Right GIS Toolbars (Directly suspended on the map) */}
            <div className="gis-toolbox">
              {/* Perspective & Compass Controls */}
              <div className="gis-btn-group" title="视角与罗盘">
                <button
                  type="button"
                  className="gis-btn"
                  title="指北针 (点击瞬时回正)"
                  onClick={() =>
                    setPresetPitch({
                      pitch: mode === "2d" ? 0 : -45,
                      heading: 0,
                      trigger: Date.now(),
                    })
                  }
                >
                  <Compass
                    className="w-4 h-4 text-blue-600 compass-dial"
                    style={{
                      transform: `rotate(${-(telemetry.heading ?? 0)}deg)`,
                    }}
                  />
                </button>

                <button
                  type="button"
                  className="gis-btn text-xs font-mono font-semibold"
                  title="垂直俯视 (90°)"
                  onClick={() =>
                    setPresetPitch({
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
                  title="鸟瞰透视 (45°)"
                  onClick={() =>
                    setPresetPitch({
                      pitch: mode === "2d" ? 45 : -40,
                      trigger: Date.now(),
                    })
                  }
                >
                  45°
                </button>

                {mode === "3d" && (
                  <button
                    type="button"
                    className="gis-btn text-xs font-mono font-semibold"
                    title="地面平视 (0°)"
                    onClick={() =>
                      setPresetPitch({
                        pitch: -5,
                        trigger: Date.now(),
                      })
                    }
                  >
                    0°
                  </button>
                )}

                {mode === "3d" && (
                  <button
                    type="button"
                    className={`gis-btn ${autoOrbit ? "active" : ""}`}
                    title={autoOrbit ? "停止巡航" : "一键 360° 环视巡检"}
                    onClick={() => setAutoOrbit(!autoOrbit)}
                  >
                    <RotateCw
                      className={`w-4 h-4 ${autoOrbit ? "animate-spin" : ""}`}
                    />
                  </button>
                )}
              </div>

              {/* Measurement Tools */}
              <div className="gis-btn-group" title="空间测量">
                <button
                  type="button"
                  className={`gis-btn ${
                    measureMode === "distance" ? "active" : ""
                  }`}
                  title="空间测距"
                  onClick={() =>
                    setMeasureMode(
                      measureMode === "distance" ? "none" : "distance",
                    )
                  }
                >
                  <Ruler className="w-4 h-4" />
                </button>

                {mode === "3d" && (
                  <button
                    type="button"
                    className={`gis-btn ${
                      measureMode === "height" ? "active" : ""
                    }`}
                    title="高差测量"
                    onClick={() =>
                      setMeasureMode(
                        measureMode === "height" ? "none" : "height",
                      )
                    }
                  >
                    <Mountain className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  className={`gis-btn ${
                    measureMode === "coordinate" ? "active" : ""
                  }`}
                  title="坐标拾取"
                  onClick={() =>
                    setMeasureMode(
                      measureMode === "coordinate" ? "none" : "coordinate",
                    )
                  }
                >
                  <Crosshair className="w-4 h-4" />
                </button>

                {measureMode !== "none" && (
                  <button
                    type="button"
                    className="gis-btn text-xs text-red-500 font-bold hover:bg-red-50"
                    title="清除测量记录"
                    onClick={() => setClearMeasureTrigger(Date.now())}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Interaction Help */}
            <div className="help">
              {mode === "2d"
                ? "拖动平移 · 滚轮缩放 · 右键旋转俯仰"
                : "左键旋转 · 滚轮缩放 · 中键平移 · 双击对焦"}
            </div>
          </TabsContent>
        </section>

        {/* Bottom Floating Telemetry & Status Bar */}
        <footer className="footer">
          <span role="status">
            {error ||
              (mode === "2d" && config && !config.mapboxToken
                ? "待填写 Mapbox token · 可切换三维查看本地模型"
                : status)}
          </span>

          <div className="hidden md:flex items-center gap-4 text-[11px] text-slate-500">
            <span>经度: {telemetry.lon.toFixed(5)}° E</span>
            <span>纬度: {telemetry.lat.toFixed(5)}° N</span>
            {telemetry.alt !== undefined && (
              <span>海拔: {telemetry.alt} m</span>
            )}
            {telemetry.pitch !== undefined && (
              <span>俯仰: {telemetry.pitch}°</span>
            )}
            {telemetry.heading !== undefined && (
              <span>方位: {telemetry.heading}°</span>
            )}
            {telemetry.zoom !== undefined && (
              <span>层级: {telemetry.zoom}</span>
            )}
          </div>

          <span className="text-slate-400 text-[11px]">
            {config
              ? `${((config.bounds[0] + config.bounds[2]) / 2).toFixed(5)}° E / ${((config.bounds[1] + config.bounds[3]) / 2).toFixed(5)}° N`
              : "—"}
          </span>
        </footer>
      </main>
    </Tabs>
  );
}
