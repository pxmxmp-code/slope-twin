import {
  Layers as LayersIcon,
  Map,
  Box,
  Maximize2,
  Minimize2,
  Mountain,
  Navigation,
  Radio,
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
      {/* Brand & System Status */}
      <div className="brand">
        <div className="brand-icon">
          <Mountain className="w-4.5 h-4.5 text-sky-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1>边坡数字孪生系统</h1>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>联机运行</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p>SLOPE DIGITAL TWIN</p>
            <span className="hidden md:inline text-[9px] text-slate-500 font-mono">
              · CGCS2000
            </span>
          </div>
        </div>
      </div>

      {/* Viewport Switcher */}
      <TabsList className="mode-switch" aria-label="视图切换">
        <TabsTrigger value="2d">
          <Map className="w-3.5 h-3.5" />
          <span>二维正射</span>
        </TabsTrigger>
        <TabsTrigger value="3d">
          <Box className="w-3.5 h-3.5" />
          <span>三维实景</span>
        </TabsTrigger>
      </TabsList>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-3 text-xs font-medium transition-all duration-200 cursor-pointer ${
            layerPanelOpen
              ? "border-sky-500/40 bg-sky-500/15 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              : "border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white hover:border-white/20"
          }`}
          onClick={onToggleLayers}
          title={layerPanelOpen ? "收起图层面板" : "展开图层面板"}
        >
          <LayersIcon className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
          <span>图层</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs font-medium border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white hover:border-white/20 transition-all duration-200 cursor-pointer disabled:opacity-40"
          disabled={!configReady}
          onClick={onLocate}
          title="定位项目测区范围"
        >
          <Navigation className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
          <span>定位</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white hover:border-white/20 transition-all duration-200 cursor-pointer"
          title={fullscreen ? "退出全屏模式" : "进入全屏模式"}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? (
            <Minimize2 className="h-3.5 w-3.5 text-slate-300" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
          )}
        </Button>
      </div>
    </header>
  );
}
