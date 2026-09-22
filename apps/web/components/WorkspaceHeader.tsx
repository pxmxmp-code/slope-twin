import {
  Layers as LayersIcon,
  Maximize2,
  Minimize2,
  Mountain,
  Navigation,
} from "lucide-react";

import type { ViewMode } from "./types";
import { Button } from "./ui/button";
import { TabsList, TabsTrigger } from "./ui/tabs";

type Props = {
  mode: ViewMode;
  configReady: boolean;
  layerPanelOpen: boolean;
  fullscreen: boolean;
  onToggleLayers: () => void;
  onLocate: () => void;
  onToggleFullscreen: () => void;
};

export function WorkspaceHeader({
  configReady,
  layerPanelOpen,
  fullscreen,
  onToggleLayers,
  onLocate,
  onToggleFullscreen,
}: Props) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-icon">
          <Mountain className="w-5 h-5" />
        </div>
        <div>
          <h1>边坡数字孪生系统</h1>
          <p>SLOPE TWIN</p>
        </div>
      </div>

      <TabsList className="mode-switch" aria-label="视图切换">
        <TabsTrigger value="2d">二维地图</TabsTrigger>
        <TabsTrigger value="3d">三维实景</TabsTrigger>
      </TabsList>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-2.5 text-xs font-medium transition-all ${
            layerPanelOpen
              ? "border-blue-200 bg-blue-50 text-blue-600"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
          onClick={onToggleLayers}
          title={layerPanelOpen ? "隐藏图层控制" : "展开图层控制"}
        >
          <LayersIcon className="w-3.5 h-3.5 mr-1" />
          图层
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs font-medium border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          disabled={!configReady}
          onClick={onLocate}
          title="定位项目范围"
        >
          <Navigation className="w-3.5 h-3.5 mr-1" />
          定位
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          title={fullscreen ? "退出全屏" : "全屏"}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
