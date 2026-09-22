"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Compass,
  Gauge,
  Loader2,
  MapPin,
  RefreshCw,
  Satellite,
} from "lucide-react";

import { LayerPanel } from "./LayerPanel";
import { MapToolbar } from "./MapToolbar";
import {
  DEFAULT_LAYERS,
  DEFAULT_LAYER_ORDER,
  DEFAULT_TELEMETRY,
  type MeasureType,
  type PresetPitch,
  type Telemetry,
  type ViewMode,
} from "./types";
import { useSceneConfig } from "./useSceneConfig";
import { Button } from "./ui/button";
import { Tabs, TabsContent } from "./ui/tabs";
import { WorkspaceHeader } from "./WorkspaceHeader";

const Map2D = dynamic(() => import("./Map2D"), { ssr: false });
const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });

export default function Workspace() {
  const { config, error, retry } = useSceneConfig();
  const [mode, setMode] = useState<ViewMode>("2d");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [layerOrder, setLayerOrder] = useState(DEFAULT_LAYER_ORDER);
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [locate, setLocate] = useState(0);
  const [status, setStatus] = useState("正在连接数字孪生底座…");
  const [measureMode, setMeasureMode] = useState<MeasureType>("none");
  const [clearMeasure, setClearMeasure] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [presetPitch, setPresetPitch] = useState<PresetPitch | null>(null);
  const [telemetry, setTelemetry] = useState(DEFAULT_TELEMETRY);
  const [fullscreen, setFullscreen] = useState(false);
  const [geologyToken, setGeologyToken] = useState("");

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    setGeologyToken(localStorage.getItem("geocloud-token") ?? "");
  }, []);

  function updateGeologyToken(token: string) {
    localStorage.setItem("geocloud-token", token);
    setGeologyToken(token);
  }

  const updateTelemetry = useCallback((next: Partial<Telemetry>) => {
    setTelemetry((current) => ({ ...current, ...next }));
  }, []);

  function changeMode(next: string) {
    setMode(next as ViewMode);
    setStatus("正在切换孪生视窗…");
    setAutoOrbit(false);
    setMeasureMode("none");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }

  const viewProps = config
    ? {
        config,
        layers,
        layerOrder,
        geologyToken,
        locate,
        measureMode,
        clearMeasureTrigger: clearMeasure,
        presetPitch,
        onStatus: setStatus,
        onTelemetryChange: updateTelemetry,
      }
    : null;

  return (
    <Tabs value={mode} onValueChange={changeMode} asChild>
      <main className="workspace">
        <WorkspaceHeader
          mode={mode}
          configReady={Boolean(config)}
          layerPanelOpen={layerPanelOpen}
          fullscreen={fullscreen}
          onToggleLayers={() => setLayerPanelOpen((value) => !value)}
          onLocate={() => setLocate((value) => value + 1)}
          onToggleFullscreen={toggleFullscreen}
        />

        <section className="body">
          <TabsContent
            value={mode}
            className="viewport m-0"
            aria-label={mode === "2d" ? "二维地图视窗" : "三维模型视窗"}
          >
            {error ? (
              <div className="empty-state" role="alert">
                <div className="empty-icon text-rose-400 bg-rose-500/10 border-rose-500/30">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2>无法连接地图服务</h2>
                <p>{error}</p>
                <Button
                  variant="outline"
                  className="border-sky-500/30 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-white"
                  onClick={retry}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />
                  重新连接服务
                </Button>
              </div>
            ) : viewProps ? (
              mode === "2d" ? (
                <Map2D {...viewProps} />
              ) : (
                <Scene3D {...viewProps} autoOrbit={autoOrbit} />
              )
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                </div>
                <h2>正在初始化数字孪生底座…</h2>
                <p>正在装配空间拓扑、遥感图层与实景流式资源</p>
              </div>
            )}

            <LayerPanel
              open={layerPanelOpen}
              mode={mode}
              config={config}
              layers={layers}
              layerOrder={layerOrder}
              setLayers={setLayers}
              setLayerOrder={setLayerOrder}
              onGeologyTokenChange={updateGeologyToken}
              onLocate={() => setLocate((value) => value + 1)}
              onClose={() => setLayerPanelOpen(false)}
              onOpen={() => setLayerPanelOpen(true)}
            />

            <MapToolbar
              mode={mode}
              telemetry={telemetry}
              measureMode={measureMode}
              autoOrbit={autoOrbit}
              onMeasureMode={setMeasureMode}
              onPresetPitch={setPresetPitch}
              onToggleOrbit={() => setAutoOrbit((value) => !value)}
              onClearMeasure={() => setClearMeasure(Date.now())}
            />

            <div className="help">
              {mode === "2d"
                ? "🖱️ 左键拖动平移 · 滚轮缩放 · 右键旋转俯仰"
                : "🖱️ 左键旋转视角 · 滚轮缩放 · 中键平移 · 双击聚焦点"}
            </div>
          </TabsContent>
        </section>

        {/* Spatial Telemetry Statusbar */}
        <footer className="footer">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span role="status" className="truncate text-[11.5px] font-medium">
              {error ||
                (mode === "2d" && config && !config.mapboxToken
                  ? "待填写 Mapbox token · 可切换三维查看模型"
                  : status)}
            </span>
          </div>

          {/* Precision Telemetry Indicators */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="telemetry-badge">
              <span className="telemetry-label">LON</span>
              <span className="telemetry-val">
                {telemetry.lon.toFixed(5)}° E
              </span>
            </div>
            <div className="telemetry-badge">
              <span className="telemetry-label">LAT</span>
              <span className="telemetry-val">
                {telemetry.lat.toFixed(5)}° N
              </span>
            </div>
            {telemetry.alt !== undefined && (
              <div className="telemetry-badge">
                <span className="telemetry-label">ALT</span>
                <span className="telemetry-val">{telemetry.alt} m</span>
              </div>
            )}
            {telemetry.pitch !== undefined && (
              <div className="telemetry-badge">
                <span className="telemetry-label">PITCH</span>
                <span className="telemetry-val">{telemetry.pitch}°</span>
              </div>
            )}
            {telemetry.heading !== undefined && (
              <div className="telemetry-badge">
                <span className="telemetry-label">HEAD</span>
                <span className="telemetry-val">{telemetry.heading}°</span>
              </div>
            )}
            {telemetry.zoom !== undefined && (
              <div className="telemetry-badge">
                <span className="telemetry-label">ZOOM</span>
                <span className="telemetry-val">{telemetry.zoom}</span>
              </div>
            )}
          </div>

          {/* Project Center & Spatial Ref */}
          <div className="flex items-center gap-3 text-slate-400 text-[10.5px] font-mono">
            <span className="hidden sm:inline">
              中心:{" "}
              {config
                ? `${((config.bounds[0] + config.bounds[2]) / 2).toFixed(4)}°E / ${((config.bounds[1] + config.bounds[3]) / 2).toFixed(4)}°N`
                : "—"}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-sky-400 text-[10px]">
              WGS-84 / 3D
            </span>
          </div>
        </footer>
      </main>
    </Tabs>
  );
}
