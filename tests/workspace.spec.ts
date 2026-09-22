import { expect, test } from "@playwright/test";

test("missing tokens, layer controls, and remote 3D model", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Missing-token behavior is deterministic; the MinIO-backed model is not mocked.
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      json: { ...config, mapboxToken: "", tiandituToken: "" },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "连接二维地图" }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "DOM 正射影像" }).click();
  await expect(
    page.getByRole("slider", { name: "影像透明度" }),
  ).toHaveAttribute("data-disabled", "");
  await page.getByRole("switch", { name: "DOM 正射影像" }).click();
  await page.getByRole("slider", { name: "影像透明度" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("slider", { name: "影像透明度" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await expect(
    page.getByRole("switch", { name: "JMD 居民地要素" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "全国 1:50 万地质图" }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "JMD 居民地要素" }).click();
  await expect(
    page.getByRole("switch", { name: "JMD 居民地要素" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "JMD 居民地要素" }).click();
  await expect(
    page.getByRole("switch", { name: "JMD 居民地要素" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/workspace-2d.png" });
  const glb = page.waitForResponse(
    (response) => response.url().endsWith(".glb") && response.status() === 200,
    { timeout: 90_000 },
  );
  await page.getByRole("tab", { name: "三维实景" }).click();
  await glb;
  await expect(page.getByRole("status")).toContainText("三维实景已加载", {
    timeout: 90_000,
  });
  await expect(page.locator(".cesium-widget canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-3d.png" });
  await page.getByRole("switch", { name: "三维实景模型" }).click();
  await expect(
    page.getByRole("switch", { name: "三维实景模型" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("tab", { name: "二维地图" }).click();
  await expect(
    page.getByRole("heading", { name: "连接二维地图" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "三维实景" }).click();
  await expect(page.getByRole("status")).toContainText("三维场景已定位");
  expect(errors).toEqual([]);
});

test("backend failure is visible and retryable", async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: 502, body: "unavailable" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "无法连接地图服务" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新连接" })).toBeVisible();
});

test("layer settings survive a reload", async ({ page }) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        mapboxToken: "",
        tiandituToken: "",
        bounds: [98.87, 27.04, 98.89, 27.06],
        domTiles: "/api/dom/{z}/{x}/{y}.png",
        tilesetUrl: "/tiles/tileset.json",
        terrainUrl: "/tiles/terrain",
        cesiumIonAccessToken: "",
        cesiumIonTerrainAssetId: null,
        geologyAvailable: false,
      },
    }),
  );
  await page.goto("/");

  await page.getByRole("switch", { name: "JMD 居民地要素" }).click();
  await page.getByRole("button", { name: "配置JMD 居民地要素" }).click();
  const opacity = page.getByRole("slider", {
    name: "JMD 居民地要素不透明度",
  });
  await opacity.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "上移图层" }).click();

  await page.reload();
  await expect(
    page.getByRole("switch", { name: "JMD 居民地要素" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "配置JMD 居民地要素" }).click();
  await expect(
    page.getByRole("slider", { name: "JMD 居民地要素不透明度" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByText("第 2 层", { exact: true })).toBeVisible();
});
