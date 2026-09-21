export type SceneConfig = {
  mapboxToken: string;
  tiandituToken: string;
  bounds: [number, number, number, number];
  domTiles: string;
  tilesetUrl: string;
};
export type Layers = {
  basemap: boolean;
  labels: boolean;
  dom: boolean;
  model: boolean;
  opacity: number;
};
export type ViewProps = {
  config: SceneConfig;
  layers: Layers;
  locate: number;
  onStatus: (message: string) => void;
};

export function tiandituUrl(layer: "vec" | "cva", token: string) {
  return `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(token)}`;
}
