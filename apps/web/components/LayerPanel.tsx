import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronUp,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  Layers as LayersIcon,
  MapPin,
  Mountain,
  SlidersHorizontal,
  Spline,
  Waypoints,
  X,
} from "lucide-react";

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
  const [tokenExpanded, setTokenExpanded] = useState(false);

  // Count active layers
  const activeCount = Object.entries(layers).reduce((acc, [key, val]) => {
    if (key === "opacity") return acc;
    if (mode === "2d" && key === "model") return acc;
    if (mode === "3d" && (key === "dom" || key === "geology")) return acc;
    return val ? acc + 1 : acc;
  }, 0);

  function renderLayerRow({
    key,
    name,
    description,
    icon,
    legend,
  }: {
    key: LayerKey;
    name: string;
    description: string;
    icon: React.ReactNode;
    legend?: React.ReactNode;
  }) {
    const isChecked = Boolean(layers[key]);
    const opacityPct = Math.round(layers.opacity[key] * 100);

    return (
      <div
        className={`layer-control transition-all duration-200 ${
          isChecked ? "active" : ""
        }`}
      >
        <label htmlFor={`layer-${key}`} className="layer-row">
          <div className="layer-row-info">
            <div
              className={`layer-icon-badge ${
                isChecked
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                  : "bg-slate-800/80 text-slate-400 border border-white/5"
              }`}
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <strong className="truncate">{name}</strong>
                {legend}
              </div>
              <small className="truncate">{description}</small>
            </div>
          </div>
          <Switch
            className="layer-switch"
            id={`layer-${key}`}
            aria-label={name}
            checked={isChecked}
            onCheckedChange={() =>
              setLayers((current) => ({ ...current, [key]: !current[key] }))
            }
          />
        </label>

        {isChecked && (
          <div className="opacity">
            <span>
              <span>不透明度</span>
              <b>{opacityPct}%</b>
            </span>
            <Slider
              className="mt-1.5"
              aria-label={`${name}不透明度`}
              min={0}
              max={100}
              value={[opacityPct]}
              onValueChange={([value]) =>
                setLayers((current) => ({
                  ...current,
                  opacity: { ...current.opacity, [key]: value / 100 },
                }))
              }
            />
          </div>
        )}
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

  if (!open) {
    return (
      <button
        type="button"
        className="absolute bottom-4 right-4 z-30 flex items-center gap-2 bg-slate-900/85 backdrop-blur-xl border border-sky-500/30 hover:border-sky-400 rounded-full px-3.5 py-2 shadow-2xl text-xs font-medium text-slate-200 hover:text-white transition-all cursor-pointer group"
        onClick={onOpen}
        title="展开图层控制面板"
      >
        <div className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 border border-sky-500/40 group-hover:scale-110 transition-transform">
          <LayersIcon className="w-3 h-3" />
        </div>
        <span>图层控制</span>
        <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[10px]">
          {activeCount}
        </span>
      </button>
    );
  }

  return (
    <div className="floating-layer-panel">
      {/* Panel Header */}
      <div className="panel-header">
        <div className="panel-title">
          <SlidersHorizontal className="w-4 h-4 text-sky-400" />
          <span>图层配置</span>
          <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[10px] border border-sky-500/30">
            {activeCount} 开启
          </span>
        </div>
        <button
          type="button"
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="收起图层面板"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel Scrollable Body */}
      <div className="panel-body">
        {/* Category 1: 航测遥感与实景 */}
        <div className="section-label">航测遥感与实景</div>
        {mode === "3d"
          ? renderLayerRow({
              key: "model",
              name: "三维实景模型",
              description: "倾斜摄影 3D Tiles 模型流",
              icon: <Mountain className="w-3.5 h-3.5" />,
            })
          : renderLayerRow({
              key: "dom",
              name: "DOM 正射影像",
              description: "无人机超高分航测影像",
              icon: <ImageIcon className="w-3.5 h-3.5" />,
            })}

        {/* Category 2: 地表与地貌要素 */}
        <div className="section-label">地表地形要素</div>
        {renderLayerRow({
          key: "jmd",
          name: "JMD 居民地要素",
          description: "建筑与居住区矢量边界",
          icon: <Building2 className="w-3.5 h-3.5" />,
          legend: (
            <span
              className="inline-block w-2 h-2 rounded-sm bg-sky-400/80 border border-sky-300 shadow-[0_0_4px_rgba(56,189,248,0.6)]"
              title="居民地矢量色标"
            />
          ),
        })}
        {renderLayerRow({
          key: "contours",
          name: "地形等高线",
          description: "高程骨干曲线与首曲线",
          icon: <Spline className="w-3.5 h-3.5" />,
          legend: (
            <span className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
              <span
                className="w-2.5 h-0.5 rounded bg-sky-400"
                title="2m 曲线"
              />
              <span
                className="w-2.5 h-0.5 rounded bg-amber-400"
                title="20m 主曲线"
              />
            </span>
          ),
        })}

        {/* Category 3: 感知监测点位 */}
        <div className="section-label">实时感知监测</div>
        {renderLayerRow({
          key: "sensors",
          name: "边坡监测站网",
          description: "GNSS/裂缝/倾角传感阵列",
          icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />,
          legend: (
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]"
              title="感知在线"
            />
          ),
        })}

        {/* Category 4: 专项与地质云 (2D mode) */}
        {mode === "2d" && config?.geologyAvailable && (
          <>
            <div className="section-label">专项与地质云</div>
            {renderLayerRow({
              key: "geology",
              name: "全国 1:50万 地质图",
              description: "地质云 WMS · 支持拾取查询",
              icon: <Waypoints className="w-3.5 h-3.5" />,
            })}

            <div className="mt-1">
              <button
                type="button"
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-sky-300 bg-slate-900/40 rounded-md border border-white/5 transition-colors cursor-pointer"
                onClick={() => setTokenExpanded((v) => !v)}
              >
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3 text-sky-400" />
                  配置地质云 Token
                </span>
                {tokenExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {tokenExpanded && (
                <form className="token-form mt-1.5" onSubmit={saveToken}>
                  <label htmlFor="geocloud-token">地质云 Token (tk)</label>
                  <div>
                    <input
                      id="geocloud-token"
                      type="password"
                      value={token}
                      placeholder="粘贴新的 tk 密钥"
                      autoComplete="off"
                      minLength={20}
                      pattern="[A-Za-z0-9._-]+"
                      onChange={(event) => {
                        setToken(event.target.value);
                        setTokenSaved(false);
                      }}
                    />
                    <button type="submit" disabled={!token.trim()}>
                      保存
                    </button>
                  </div>
                  {tokenSaved && <small>已应用并保存在当前浏览器缓存</small>}
                </form>
              )}
            </div>
          </>
        )}

        {/* Category 5: 基础地理底图 */}
        <div className="section-label">基础地理底图</div>
        {renderLayerRow({
          key: "basemap",
          name: "电子底图",
          description: "基础地形与道路水系网",
          icon: <Globe2 className="w-3.5 h-3.5" />,
        })}
        {renderLayerRow({
          key: "labels",
          name: "中文地名注记",
          description: "行政区划与兴趣点标注",
          icon: <MapPin className="w-3.5 h-3.5" />,
        })}

        {config && !config.tiandituToken && (
          <p className="notice mt-1">
            天地图密钥未配置，当前已自动启用 Carto 高精度底图。
          </p>
        )}
      </div>
    </div>
  );
}
