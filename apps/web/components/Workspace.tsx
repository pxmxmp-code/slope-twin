"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { LayerPanel } from "./LayerPanel";
import { MapToolbar } from "./MapToolbar";
import {
  DEFAULT_LAYERS,
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
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [locate, setLocate] = useState(0);
  const [status, setStatus] = useState("正在连接服务…");
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
    setStatus("正在切换视图…");
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
                <div className="empty-icon text-red-500 bg-red-50">⚠️</div>
                <h2>无法连接地图服务</h2>
                <p>{error}</p>
                <Button variant="outline" onClick={retry}>
                  重新连接
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
                <div className="empty-icon">⏳</div>
                <h2>正在连接地图服务…</h2>
              </div>
            )}

            <LayerPanel
              open={layerPanelOpen}
              mode={mode}
              config={config}
              layers={layers}
              setLayers={setLayers}
              onGeologyTokenChange={updateGeologyToken}
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
                ? "拖动平移 · 滚轮缩放 · 右键旋转俯仰"
                : "左键旋转 · 滚轮缩放 · 中键平移 · 双击对焦"}
            </div>
          </TabsContent>
        </section>

        <footer className="footer">
          <span role="status">
            {error ||
              (mode === "2d" && config && !config.mapboxToken
                ? "待填写 Mapbox token · 可切换三维查看模型"
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
