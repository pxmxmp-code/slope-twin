export type SceneConfig = {
  mapboxToken: string;
  tiandituToken: string;
  bounds: [number, number, number, number];
  domTiles: string;
  tilesetUrl: string;
};

export type BasemapType = "light" | "satellite" | "vector" | "dark" | "none";

export type VisualMode = "natural" | "wireframe";

export type MeasureType = "none" | "distance" | "height" | "coordinate";

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

export type Layers = {
  basemap: boolean;
  labels: boolean;
  dom: boolean;
  model: boolean;
  opacity: number;
  basemapType: BasemapType;
  sensors: boolean;
  // 3D visual & environment effects
  wireframe: boolean;
  visualMode: VisualMode;
  enableSun: boolean;
  enableShadows: boolean;
  enableAtmosphere: boolean;
  enableBloom: boolean;
  enableDepthTest: boolean;
};

export type Telemetry = {
  lon: number;
  lat: number;
  alt?: number;
  zoom?: number;
  pitch?: number;
  heading?: number;
  fps?: number;
};

export type PresetPitch = {
  pitch: number;
  heading?: number;
  trigger: number;
};

export type ViewProps = {
  config: SceneConfig;
  layers: Layers;
  locate: number;
  measureMode: MeasureType;
  clearMeasureTrigger: number;
  autoOrbit?: boolean;
  presetPitch: PresetPitch | null;
  onStatus: (message: string) => void;
  onTelemetryChange?: (telemetry: Partial<Telemetry>) => void;
  onSensorSelect?: (sensor: SlopeSensor | null) => void;
  selectedSensor?: SlopeSensor | null;
};

export function tiandituUrl(
  layer: "vec" | "cva" | "img" | "cia",
  token: string,
) {
  return `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(token)}`;
}

export const CARTO_LIGHT_TILES =
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
export const CARTO_LIGHT_LABELS =
  "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png";
export const CARTO_DARK_TILES =
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
export const CARTO_DARK_LABELS =
  "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png";

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
