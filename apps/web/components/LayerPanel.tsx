import {
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Globe2,
  Image as ImageIcon,
  Info,
  KeyRound,
  Layers as LayersIcon,
  MapPin,
  Mountain,
  Settings2,
  Spline,
  Waypoints,
  X,
  ZoomIn,
} from "lucide-react";

import type { LayerKey, Layers, SceneConfig, ViewMode } from "./types";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

type Category = "all" | "base" | "topic" | "mine";
type LayerDefinition = {
  name: string;
  description: string;
  category: Exclude<Category, "all">;
  badge: string;
  icon: ReactNode;
  source: string;
  type: string;
};

type Props = {
  open: boolean;
  mode: ViewMode;
  config: SceneConfig | null;
  layers: Layers;
  layerOrder: LayerKey[];
  setLayers: Dispatch<SetStateAction<Layers>>;
  setLayerOrder: Dispatch<SetStateAction<LayerKey[]>>;
  onGeologyTokenChange: (token: string) => void;
  onLocate: () => void;
  onClose: () => void;
  onOpen: () => void;
};

const DEFINITIONS: Record<LayerKey, LayerDefinition> = {
  sensors: {
    name: "边坡监测站网",
    description: "GNSS / 裂缝 / 倾角传感阵列",
    category: "mine",
    badge: "我的",
    icon: <Activity />,
    source: "边坡实时监测系统",
    type: "监测点位",
  },
  contours: {
    name: "地形等高线",
    description: "高程骨干曲线与首曲线",
    category: "base",
    badge: "基础",
    icon: <Spline />,
    source: "高程数据",
    type: "矢量线",
  },
  jmd: {
    name: "JMD 居民地要素",
    description: "建筑与居住区矢量边界",
    category: "topic",
    badge: "专题",
    icon: <Building2 />,
    source: "居民地专题数据",
    type: "矢量面",
  },
  labels: {
    name: "中文地名注记",
    description: "行政区划与兴趣点标注",
    category: "topic",
    badge: "专题",
    icon: <MapPin />,
    source: "天地图 / Carto",
    type: "栅格注记",
  },
  geology: {
    name: "全国 1:50万 地质图",
    description: "地质云 WMS · 支持拾取查询",
    category: "topic",
    badge: "专题",
    icon: <Waypoints />,
    source: "地质云 WMS",
    type: "栅格瓦片",
  },
  dom: {
    name: "DOM 正射影像",
    description: "无人机高分辨率影像",
    category: "base",
    badge: "基础",
    icon: <ImageIcon />,
    source: "项目航测成果",
    type: "栅格瓦片",
  },
  model: {
    name: "三维实景模型",
    description: "倾斜摄影 3D Tiles 模型流",
    category: "base",
    badge: "基础",
    icon: <Mountain />,
    source: "项目倾斜摄影成果",
    type: "3D Tiles",
  },
  basemap: {
    name: "电子底图",
    description: "基础地形与道路水系网",
    category: "base",
    badge: "基础",
    icon: <Globe2 />,
    source: "天地图 / Carto",
    type: "栅格瓦片",
  },
};

export function LayerPanel({
  open,
  mode,
  config,
  layers,
  layerOrder,
  setLayers,
  setLayerOrder,
  onGeologyTokenChange,
  onLocate,
  onClose,
  onOpen,
}: Props) {
  const [category, setCategory] = useState<Category>("all");
  const [selected, setSelected] = useState<LayerKey | null>("contours");
  const [collapsed, setCollapsed] = useState(false);
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenExpanded, setTokenExpanded] = useState(false);

  const availableKeys = layerOrder.filter(
    (key) =>
      key !== (mode === "2d" ? "model" : "dom") &&
      !(mode === "3d" && key === "geology") &&
      !(key === "geology" && !config?.geologyAvailable),
  );
  const shownKeys = availableKeys.filter(
    (key) => category === "all" || DEFINITIONS[key].category === category,
  );
  const selectedKey =
    selected && availableKeys.includes(selected) ? selected : null;
  const activeCount = availableKeys.filter((key) => layers[key]).length;
  const categories: Array<{ key: Category; label: string }> = [
    { key: "all", label: "全部" },
    { key: "base", label: "基础" },
    { key: "topic", label: "专题" },
    { key: "mine", label: "我的" },
  ];

  function countCategory(key: Category) {
    return key === "all"
      ? availableKeys.length
      : availableKeys.filter((item) => DEFINITIONS[item].category === key)
          .length;
  }

  function setVisible(key: LayerKey, checked: boolean) {
    setLayers((current) => ({ ...current, [key]: checked }));
  }

  function moveLayer(key: LayerKey, offset: -1 | 1) {
    setLayerOrder((current) => {
      const visible = current.filter((item) => availableKeys.includes(item));
      const from = visible.indexOf(key);
      const target = from + offset;
      if (from < 0 || target < 0 || target >= visible.length) return current;
      const neighbor = visible[target];
      if (
        [key, neighbor].some((item) => item === "sensors" || item === "basemap")
      )
        return current;
      const next = [...current];
      const fromIndex = next.indexOf(key);
      const targetIndex = next.indexOf(neighbor);
      [next[fromIndex], next[targetIndex]] = [
        next[targetIndex],
        next[fromIndex],
      ];
      return next;
    });
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
      <button type="button" className="layer-panel-trigger" onClick={onOpen}>
        <span className="layer-panel-trigger-icon">
          <LayersIcon />
        </span>
        <span>图层配置</span>
        <span className="layer-panel-trigger-count">{activeCount}</span>
      </button>
    );

  const detail = selectedKey ? DEFINITIONS[selectedKey] : null;
  const selectedIndex = selectedKey ? availableKeys.indexOf(selectedKey) : -1;
  const canMoveUp =
    selectedIndex > 0 &&
    selectedKey !== "sensors" &&
    availableKeys[selectedIndex - 1] !== "sensors";
  const canMoveDown =
    selectedIndex >= 0 &&
    selectedIndex < availableKeys.length - 1 &&
    selectedKey !== "basemap" &&
    availableKeys[selectedIndex + 1] !== "basemap";

  return (
    <>
      <aside
        className={`floating-layer-panel ${collapsed ? "collapsed" : ""}`}
        aria-label="图层配置"
      >
        <header className="panel-header">
          <span className="panel-title-icon">
            <LayersIcon />
          </span>
          <span className="panel-title-copy">
            <strong>图层配置</strong>
            <small>
              {collapsed
                ? `${activeCount} 个图层正在显示`
                : "管理地图图层的显示与样式"}
            </small>
          </span>
          <button
            type="button"
            className="panel-collapse"
            aria-label={collapsed ? "展开图层配置" : "收起图层配置"}
            title={collapsed ? "展开" : "收起"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </button>
          <button
            type="button"
            className="panel-close"
            aria-label="关闭图层配置"
            onClick={() => {
              setCollapsed(false);
              onClose();
            }}
          >
            <X />
          </button>
        </header>

        <nav className="layer-categories" aria-label="图层分类">
          {categories.map((item) => (
            <button
              type="button"
              key={item.key}
              className={category === item.key ? "active" : ""}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
              <span>{countCategory(item.key)}</span>
            </button>
          ))}
        </nav>

        <div className="panel-body">
          <div className="layer-list">
            {shownKeys.map((key) => {
              const item = DEFINITIONS[key];
              return (
                <article
                  key={key}
                  className={`layer-card ${selectedKey === key ? "selected" : ""}`}
                  onClick={() => setSelected(key)}
                >
                  <span className="layer-card-icon">{item.icon}</span>
                  <span className="layer-card-copy">
                    <span className="layer-card-title">
                      <strong>{item.name}</strong>
                      <i className={`layer-badge ${item.category}`}>
                        {item.badge}
                      </i>
                    </span>
                    <small>{item.description}</small>
                  </span>
                  <Switch
                    aria-label={item.name}
                    checked={layers[key]}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(value) => setVisible(key, value)}
                  />
                  <button
                    type="button"
                    className="layer-detail-trigger"
                    aria-label={`配置${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelected(key);
                    }}
                  >
                    <ChevronRight />
                  </button>
                </article>
              );
            })}
          </div>

          {mode === "2d" && config?.geologyAvailable && (
            <section className="token-section">
              <div className="section-label">地质云服务</div>
              <button
                type="button"
                className="token-trigger"
                onClick={() => setTokenExpanded((value) => !value)}
              >
                <span>
                  <KeyRound />
                  配置地质云 Token
                </span>
                {tokenExpanded ? <ChevronUp /> : <ChevronDown />}
              </button>
              {tokenExpanded && (
                <form className="token-form" onSubmit={saveToken}>
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
            </section>
          )}
        </div>
      </aside>

      {!collapsed && selectedKey && detail && (
        <aside className="layer-detail-panel" aria-label={`${detail.name}设置`}>
          <header className="detail-header">
            <span className="layer-card-icon">{detail.icon}</span>
            <span>
              <strong>{detail.name}</strong>
              <small>{detail.description}</small>
            </span>
            <button
              type="button"
              aria-label="关闭图层详情"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
          </header>

          <div className="detail-visibility">
            <strong>显示图层</strong>
            <Switch
              aria-label={`显示${detail.name}`}
              checked={layers[selectedKey]}
              onCheckedChange={(value) => setVisible(selectedKey, value)}
            />
          </div>

          <section className="detail-section">
            <h3>
              <Settings2 />
              样式设置
            </h3>
            <div className="detail-setting">
              <label>不透明度</label>
              <Slider
                aria-label={`${detail.name}不透明度`}
                min={0}
                max={100}
                value={[Math.round(layers.opacity[selectedKey] * 100)]}
                onValueChange={([value]) =>
                  setLayers((current) => ({
                    ...current,
                    opacity: {
                      ...current.opacity,
                      [selectedKey]: value / 100,
                    },
                  }))
                }
              />
              <output>{Math.round(layers.opacity[selectedKey] * 100)}%</output>
            </div>
            <div className="detail-order">
              <span>
                <small>叠放顺序</small>
                <strong>第 {selectedIndex + 1} 层</strong>
              </span>
              <span>
                <button
                  type="button"
                  disabled={!canMoveUp}
                  aria-label="上移图层"
                  onClick={() => moveLayer(selectedKey, -1)}
                >
                  <ArrowUp />
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  aria-label="下移图层"
                  onClick={() => moveLayer(selectedKey, 1)}
                >
                  <ArrowDown />
                </button>
              </span>
            </div>
          </section>

          <section className="detail-section layer-info">
            <h3>
              <Info />
              图层信息
            </h3>
            <dl>
              <div>
                <dt>数据来源</dt>
                <dd>{detail.source}</dd>
              </div>
              <div>
                <dt>图层类型</dt>
                <dd>{detail.type}</dd>
              </div>
              <div>
                <dt>坐标系</dt>
                <dd>WGS 84</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{layers[selectedKey] ? "正在显示" : "已关闭"}</dd>
              </div>
            </dl>
          </section>

          <button type="button" className="zoom-layer" onClick={onLocate}>
            <ZoomIn />
            缩放至图层范围
          </button>
        </aside>
      )}
    </>
  );
}
