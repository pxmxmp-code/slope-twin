import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
// 使用 Cesium 官方预构建包，Worker、WASM、样式与主库版本保持一致。
await mkdir("public/cesium", { recursive: true });
await cp(
  join(dirname(require.resolve("cesium/package.json")), "Build/Cesium"),
  "public/cesium",
  { recursive: true },
);
