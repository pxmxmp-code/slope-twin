"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Layers, SceneConfig } from "./types";
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
  const [layers, setLayers] = useState<Layers>({
    basemap: true,
    labels: true,
    dom: true,
    model: true,
    opacity: 1,
  });
  const [locate, setLocate] = useState(0);
  const [status, setStatus] = useState("正在连接服务…");

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

  function toggle(key: "basemap" | "labels" | "dom" | "model") {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }
  function layerRow(
    key: "basemap" | "labels" | "dom" | "model",
    name: string,
    description: string,
    disabled = false,
  ) {
    return (
      <label
        htmlFor={`layer-${key}`}
        className={`layer-row ${disabled ? "disabled" : ""}`}
      >
        <span>
          <strong>{name}</strong>
          <small>{description}</small>
        </span>
        <Switch
          id={`layer-${key}`}
          aria-label={name}
          checked={layers[key]}
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
      }}
      asChild
    >
      <main className="workspace">
        <header className="header">
          <div className="brand">
            <span className="brand-mark">◭</span>
            <div>
              <h1>边坡实景</h1>
              <p>SLOPE TWIN</p>
            </div>
          </div>
          <TabsList className="mode-switch" aria-label="视图切换">
            <TabsTrigger value="2d">二维地图</TabsTrigger>
            <TabsTrigger value="3d">三维实景</TabsTrigger>
          </TabsList>
          <span className="phase">空间底座 · 一期</span>
        </header>
        <section className="body">
          <aside className="sidebar">
            <div className="section-heading">
              <span>图层管理</span>
              <span className="badge">{mode === "2d" ? "2D" : "3D"}</span>
            </div>
            <p className="intro">
              {mode === "2d"
                ? "查看正射影像与周边道路"
                : "浏览现场地形与实景模型"}
            </p>
            <h2>基础地图</h2>
            {layerRow(
              "basemap",
              "天地图电子地图",
              "道路、水系与居民地",
              !config?.tiandituToken,
            )}
            {layerRow(
              "labels",
              "中文注记",
              "地名与道路名称",
              !config?.tiandituToken,
            )}
            <h2>项目数据</h2>
            {mode === "2d" ? (
              <>
                {layerRow("dom", "DOM 正射影像", "项目区域航测影像")}
                <div className="opacity">
                  <span>
                    影像透明度 <b>{Math.round((1 - layers.opacity) * 100)}%</b>
                  </span>
                  <Slider
                    className="mt-4"
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
              layerRow("model", "三维实景模型", "OSGB 转换 · 3D Tiles")
            )}
            {config && !config.tiandituToken && (
              <p className="notice">
                天地图尚未配置，填写 key 后可显示电子地图与中文注记。
              </p>
            )}
            <div className="sidebar-bottom">
              <span className="eyebrow">项目视图</span>
              <p>
                二维看全貌
                <br />
                三维看现场
              </p>
              <Button
                variant="outline"
                className="locate"
                disabled={!config}
                onClick={() => setLocate((value) => value + 1)}
              >
                ⌖ 定位项目范围
              </Button>
            </div>
          </aside>
          <TabsContent
            value={mode}
            className="viewport m-0"
            aria-label={mode === "2d" ? "二维地图视窗" : "三维模型视窗"}
          >
            {error ? (
              <div className="empty-state" role="alert">
                <h2>服务尚未连接</h2>
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
                  onStatus={setStatus}
                />
              ) : (
                <Scene3D
                  config={config}
                  layers={layers}
                  locate={locate}
                  onStatus={setStatus}
                />
              )
            ) : (
              <div className="empty-state">正在连接地图服务…</div>
            )}
            <div className="view-caption">
              <span className="live-dot" />
              <span>
                {mode === "2d" ? "正射影像 · 平面浏览" : "实景模型 · 自由浏览"}
              </span>
            </div>
            <div className="help">
              {mode === "2d"
                ? "拖动平移 · 滚轮缩放"
                : "左键平移 · 滚轮缩放 · 中键旋转"}
            </div>
          </TabsContent>
        </section>
        <footer className="footer">
          <span role="status">
            {error ||
              (mode === "2d" && config && !config.mapboxToken
                ? "待填写 Mapbox token · 可切换三维查看本地模型"
                : status)}
          </span>
          <span>
            {config
              ? `${((config.bounds[0] + config.bounds[2]) / 2).toFixed(5)}° E / ${((config.bounds[1] + config.bounds[3]) / 2).toFixed(5)}° N`
              : "—"}
          </span>
        </footer>
      </main>
    </Tabs>
  );
}
