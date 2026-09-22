import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Layers as LayersIcon, SlidersHorizontal, X } from "lucide-react";

import type { LayerKey, Layers, SceneConfig, ViewMode } from "./types";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

type Props = {
  open: boolean;
  mode: ViewMode;
  config: SceneConfig | null;
  layers: Layers;
  setLayers: Dispatch<SetStateAction<Layers>>;
  onGeologyTokenChange: (token: string) => void;
  onClose: () => void;
  onOpen: () => void;
};

export function LayerPanel({
  open,
  mode,
  config,
  layers,
  setLayers,
  onGeologyTokenChange,
  onClose,
  onOpen,
}: Props) {
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);

  function row(key: LayerKey, name: string, description: string) {
    return (
      <div className="layer-control">
        <label htmlFor={`layer-${key}`} className="layer-row">
          <div>
            <strong>{name}</strong>
            <small>{description}</small>
          </div>
          <Switch
            className="layer-switch"
            id={`layer-${key}`}
            aria-label={name}
            checked={layers[key]}
            onCheckedChange={() =>
              setLayers((current) => ({ ...current, [key]: !current[key] }))
            }
          />
        </label>
        <div className="opacity">
          <span>
            不透明度 <b>{Math.round(layers.opacity[key] * 100)}%</b>
          </span>
          <Slider
            className="mt-2"
            aria-label={`${name}不透明度`}
            min={0}
            max={100}
            value={[Math.round(layers.opacity[key] * 100)]}
            disabled={!layers[key]}
            onValueChange={([value]) =>
              setLayers((current) => ({
                ...current,
                opacity: { ...current.opacity, [key]: value / 100 },
              }))
            }
          />
        </div>
      </div>
    );
  }

  function saveToken(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    onGeologyTokenChange(value);
    setToken("");
    setTokenSaved(true);
  }

  if (!open)
    return (
      <button
        type="button"
        className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full px-3 py-1.5 shadow-md text-[11px] font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
        onClick={onOpen}
        title="展开图层控制"
      >
        <LayersIcon className="w-3.5 h-3.5 text-blue-600" />
        <span>展开图层</span>
      </button>
    );

  return (
    <div className="floating-layer-panel">
      <div className="panel-header">
        <div className="panel-title">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <span>图层控制</span>
        </div>
        <button type="button" title="收起图层" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="panel-body">
        <div className="section-label">图层开关</div>
        {row("basemap", "电子地图", "基础地理背景")}
        {row("labels", "中文注记", "地名与道路名称")}
        {row("jmd", "JMD 居民地要素", "建筑物与居住区范围矢量")}
        {row("contours", "等高线", "蓝色 2m · 橙色 20m 主曲线")}
        {mode === "2d" ? (
          <>
            {config?.geologyAvailable &&
              row("geology", "全国 1:50 万地质图", "地质云 WMS · 点击查询属性")}
            {config?.geologyAvailable && (
              <form className="token-form" onSubmit={saveToken}>
                <label htmlFor="geocloud-token">地质云 Token</label>
                <div>
                  <input
                    id="geocloud-token"
                    type="password"
                    value={token}
                    placeholder="粘贴新的 tk"
                    autoComplete="off"
                    minLength={20}
                    pattern="[A-Za-z0-9._-]+"
                    onChange={(event) => {
                      setToken(event.target.value);
                      setTokenSaved(false);
                    }}
                  />
                  <button type="submit" disabled={!token.trim()}>
                    更新
                  </button>
                </div>
                {tokenSaved && <small>已应用并保存在当前浏览器</small>}
              </form>
            )}
            {row("dom", "DOM 正射影像", "航测遥感影像")}
          </>
        ) : (
          <>{row("model", "三维实景模型", "倾斜摄影 3D Tiles")}</>
        )}
        {row("sensors", "边坡监测点位", "现场传感器位置")}
        {config && !config.tiandituToken && (
          <p className="notice">天地图密钥未配置，当前使用浅色底图。</p>
        )}
      </div>
    </div>
  );
}
