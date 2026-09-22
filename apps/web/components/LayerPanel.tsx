import type { Dispatch, SetStateAction } from "react";
import { Layers as LayersIcon, SlidersHorizontal, X } from "lucide-react";

import type { Layers, SceneConfig, ViewMode } from "./types";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

type Props = {
  open: boolean;
  mode: ViewMode;
  config: SceneConfig | null;
  layers: Layers;
  setLayers: Dispatch<SetStateAction<Layers>>;
  onClose: () => void;
  onOpen: () => void;
};

export function LayerPanel({
  open,
  mode,
  config,
  layers,
  setLayers,
  onClose,
  onOpen,
}: Props) {
  function row(key: keyof Layers, name: string, description: string) {
    return (
      <label htmlFor={`layer-${key}`} className="layer-row">
        <div>
          <strong>{name}</strong>
          <small>{description}</small>
        </div>
        <Switch
          id={`layer-${key}`}
          aria-label={name}
          checked={Boolean(layers[key])}
          onCheckedChange={() =>
            setLayers((current) => ({ ...current, [key]: !current[key] }))
          }
        />
      </label>
    );
  }

  if (!open)
    return (
      <button
        type="button"
        className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full px-3.5 py-1.5 shadow-md text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
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
        {mode === "2d" ? (
          <>
            {row("dom", "DOM 正射影像", "航测遥感影像")}
            <div className="opacity">
              <span>
                影像透明度 <b>{Math.round((1 - layers.opacity) * 100)}%</b>
              </span>
              <Slider
                className="mt-3"
                aria-label="影像透明度"
                min={0}
                max={100}
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
          row("model", "三维实景模型", "倾斜摄影 3D Tiles")
        )}
        {row("sensors", "边坡监测点位", "现场传感器位置")}
        {config && !config.tiandituToken && (
          <p className="notice">天地图密钥未配置，当前使用浅色底图。</p>
        )}
      </div>
    </div>
  );
}
