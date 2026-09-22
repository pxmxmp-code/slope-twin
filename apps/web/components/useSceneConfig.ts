import { useCallback, useEffect, useState } from "react";

import type { SceneConfig } from "./types";

function isSceneConfig(value: unknown): value is SceneConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.mapboxToken === "string" &&
    typeof config.tiandituToken === "string" &&
    Array.isArray(config.bounds) &&
    config.bounds.length === 4 &&
    config.bounds.every((item) => typeof item === "number") &&
    typeof config.domTiles === "string" &&
    typeof config.tilesetUrl === "string"
  );
}

export function useSceneConfig() {
  const [config, setConfig] = useState<SceneConfig | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/config", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: unknown = await response.json();
        if (!isSceneConfig(value)) throw new Error("invalid config");
        return value;
      })
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("无法连接地图服务，请确认 FastAPI 已启动。 ");
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { config, error, retry };
}
