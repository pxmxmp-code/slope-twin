export type SceneConfig = {
  mapboxToken: string;
  tiandituToken: string;
  bounds: [number, number, number, number];
  domTiles: string;
  tilesetUrl: string;
  terrainUrl: string;
  cesiumIonAccessToken: string;
  cesiumIonTerrainAssetId: number | null;
  cesiumIonImageryAssetId: number | null;
  modelHeightOffset: number;
  geologyAvailable: boolean;
};

export type ViewMode = "2d" | "3d";
export type MapTool =
  "navigate" | "query" | "distance" | "height" | "coordinate";
export type ZoomCommand = { direction: "in" | "out" };

export type SlopeSensor = {
  id: string;
  name: string;
  type: "GNSS" | "INCL" | "CRACK" | "RAIN";
  lon: number;
  lat: number;
  alt: number;
  status: "normal" | "warning" | "alert";
  value: string;
  velocity: string;
  updatedAt: string;
};

export type LayerKey =
  | "basemap"
  | "labels"
  | "dom"
  | "model"
  | "sensors"
  | "jmd"
  | "contours"
  | "geology";

export type Layers = Record<LayerKey, boolean> & {
  opacity: Record<LayerKey, number>;
};

export type Telemetry = {
  lon: number;
  lat: number;
  alt?: number;
  zoom?: number;
  pitch?: number;
  heading?: number;
};

export type PresetPitch = {
  pitch: number;
  heading?: number;
  trigger: number;
};

export type ViewProps = {
  config: SceneConfig;
  layers: Layers;
  layerOrder: LayerKey[];
  modelHeightOffset: number;
  geologyToken?: string;
  locate: number;
  activeTool: MapTool;
  clearTrigger: number;
  zoomCommand: ZoomCommand | null;
  autoOrbit?: boolean;
  presetPitch: PresetPitch | null;
  onStatus: (message: string) => void;
  onTelemetryChange?: (telemetry: Partial<Telemetry>) => void;
};

export const DEFAULT_LAYERS: Layers = {
  basemap: true,
  labels: false,
  dom: true,
  model: true,
  sensors: true,
  jmd: false,
  contours: false,
  geology: false,
  opacity: {
    basemap: 0.85,
    labels: 1,
    dom: 1,
    model: 1,
    sensors: 1,
    jmd: 0.15,
    contours: 0.65,
    geology: 0.6,
  },
};

// Top to bottom, matching the visual stack shown in the layer panel.
export const DEFAULT_LAYER_ORDER: LayerKey[] = [
  "sensors",
  "contours",
  "jmd",
  "labels",
  "geology",
  "dom",
  "model",
  "basemap",
];

export const DEFAULT_TELEMETRY: Telemetry = {
  lon: 98.88215,
  lat: 27.05023,
  alt: 1850,
  zoom: 16.5,
  pitch: 0,
  heading: 0,
};

export function tiandituUrl(layer: "vec" | "cva", token: string) {
  return `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(token)}`;
}

export const CARTO_LIGHT_TILES =
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
export const CARTO_LIGHT_LABELS =
  "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png";

export const DEFAULT_SENSORS: SlopeSensor[] = [
  {
    id: "GNSS-01",
    name: "GNSS-01 坡顶基准站",
    type: "GNSS",
    lon: 98.88352,
    lat: 27.05184,
    alt: 1985,
    status: "normal",
    value: "三维位移: 3.2 mm",
    velocity: "速率: +0.04 mm/d",
    updatedAt: "10秒前",
  },
  {
    id: "GNSS-02",
    name: "GNSS-02 主滑体中段",
    type: "GNSS",
    lon: 98.88126,
    lat: 27.04958,
    alt: 1860,
    status: "normal",
    value: "三维位移: 5.8 mm",
    velocity: "速率: +0.08 mm/d",
    updatedAt: "12秒前",
  },
  {
    id: "CRACK-01",
    name: "CRACK-01 后缘裂缝计",
    type: "CRACK",
    lon: 98.87985,
    lat: 27.04886,
    alt: 1820,
    status: "warning",
    value: "裂缝开度: 1.42 mm",
    velocity: "扩展: +0.15 mm/d",
    updatedAt: "8秒前",
  },
  {
    id: "RAIN-01",
    name: "RAIN-01 坡脚雨量气象站",
    type: "RAIN",
    lon: 98.88508,
    lat: 27.04782,
    alt: 1740,
    status: "normal",
    value: "今日降雨: 12.5 mm",
    velocity: "小时雨强: 2.0 mm/h",
    updatedAt: "3分钟前",
  },
];
