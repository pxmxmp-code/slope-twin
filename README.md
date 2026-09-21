# Slope Twin · 边坡实景

第一阶段完成二维电子地图、DOM 叠加、图层开关、影像透明度、三维实景模型浏览、项目定位和二维／三维切换。UI 使用 shadcn/ui（Radix 组件）与 Tailwind CSS。

## Monorepo 结构

```text
slope-twin/
├── apps/
│   ├── web/                 # Next.js App Router、Mapbox GL JS、Cesium、shadcn/ui
│   └── api/                 # FastAPI、WMS 适配、模型静态服务、PostgreSQL 连接检查
├── data/                   # 原始资料与处理结果，不纳入 Git
│   └── TILES/tileset.json  # 现有 3D Tiles 根入口
├── tests/                  # 浏览器集成检查
├── .env                    # 唯一的本地配置文件，不纳入 Git
├── .env.example            # 配置模板
├── package.json            # npm workspace 与统一任务入口
└── package-lock.json       # 前端依赖锁；Python 依赖由 apps/api/uv.lock 锁定
```

前端用 npm workspaces 管理，Python 应用用 uv 独立管理。暂无共享业务代码，暂不建立空的 `packages` 包。

## 启动

需要 Node.js 22.12+、npm、Python 3.12+、uv，以及已运行的 GeoServer。以下命令在仓库根目录执行；本项目按约定使用 `rtk` 前缀。

```bash
rtk npm install
rtk proxy uv sync --project apps/api
rtk npm run dev
```

打开 http://localhost:3000。前端为 3000 端口，后端为 8000，GeoServer 使用现有的 8080。也可在两个终端分别运行 `rtk npm run dev:web` 和 `rtk npm run dev:api`。

仅监听本机时，将开发脚本的 `0.0.0.0` 改为 `127.0.0.1`。当前阶段没有登录和权限管理。

生产构建：`rtk npm run build`，然后运行 `rtk npm run start:web` 和 `rtk npm run start:api`。开发命令支持前后端热重载，生产启动不启用热重载。正式部署的进程托管、HTTPS 与权限管理另行配置。

## 一个 .env 可以配置什么

| 配置 | 对应功能 | 当前是否需要填写 |
| --- | --- | --- |
| `MAPBOX_TOKEN` | Mapbox GL JS 二维地图引擎，承载天地图和 DOM | 二维需要；填 Mapbox 的 `pk.` 公共 token |
| `TIANDITU_TOKEN` | 天地图电子地图 `vec_w`、中文注记 `cva_w`；也用于三维电子底图 | 需要这些底图时填写天地图 Web 端应用 key |
| `GEOSERVER_WMS_URL` | 后端请求 DOM 的 WMS 服务 | 已填现有服务地址 |
| `GEOSERVER_DOM_LAYER` | 指定 DOM 图层 | 已填 `ne:DOM_COG` |
| `DOM_BOUNDS` | 二维初始定位与 DOM 请求范围 | 已按现有服务填写，顺序为西、南、东、北经纬度 |
| `TILES_DIRECTORY` | 发布已转换的 3D Tiles 数据目录 | 已填 `data/TILES`，相对仓库根目录 |
| `BACKEND_URL` | Next.js 的同源代理目标 | 本机默认 `http://127.0.0.1:8000` |
| `DATABASE_URL` | PostgreSQL 连接与健康检查 | 可留空；填 `postgresql://用户名:密码@主机:端口/数据库` |

修改 `.env` 后重启前后端并刷新页面；修改 `BACKEND_URL` 后生产模式需重新构建前端。

本地 3D Tiles 加载**不需要 Cesium ion token**。当前使用椭球底面，不启用 Cesium 在线地形、在线影像或 ion 资产，因此没有无效的 ion 配置占位。

Mapbox 与天地图 token 必须供浏览器使用，会出现在网络请求中；请使用公共／Web 类型令牌并配置允许访问的域名（本地调试包括 localhost）。`.env` 不提交 Git。数据库连接信息只在后端使用，`/api/config` 按白名单返回公共地图配置。

## 数据与坐标处理

- 原始 DOM 为 EPSG:4521。前端按 XYZ 瓦片请求 `/api/dom/{z}/{x}/{y}.png`，FastAPI 计算 EPSG:3857 瓦片范围，GeoServer 负责重投影并返回透明 PNG。无需重做原始 DOM。
- 用户给出的 `format=application/openlayers` 是预览页面格式；这里使用 `format=image/png`。统一采用 WMS 1.1.1，避免 WMS 1.3.0 经纬轴顺序混淆。
- 天地图底图、DOM、中文注记依次叠加；三者可以分别开关，DOM 支持透明度调节。
- 已有 `data/TILES/tileset.json` 包含地球坐标变换，Cesium 使用模型自带定位，不手工猜测偏移量。支持模型显隐、旋转、缩放与重新定位。
- 切换二维／三维时保留图层设置，释放上一视图的 WebGL 实例；各视图重新定位至项目。第一阶段不实现两个引擎的相机姿态同步。
- 三维仅显示实景模型与可选电子底图，不另行叠加 DOM。当前也不包含 OSGB 转换任务、测量、剖面、监测、预警、用户管理。
- `/tiles` 仅公开配置的 TILES 目录，不公开 DOM 原始 TIFF、OSGB、LAS 或其他原始资料。模型按视距分块加载，支持 HTTP Range。

PostgreSQL 连接检查位于 `/api/health`。`database=not_configured` 表示尚未填写连接串，`unavailable` 表示连接失败。数据库服务与数据库本身需事先准备；此阶段不创建业务表，也不把大模型或影像写进数据库。后续有项目、图层、监测等业务数据时再增加表结构和迁移。

## 检查

```bash
rtk npm run typecheck
rtk npm run build
rtk npm run test:api
rtk proxy npx playwright install chromium
# Linux 如提示缺少系统库，需安装 Chromium 运行依赖：
# rtk proxy npx playwright install-deps chromium
# 前后端启动后运行：
rtk npm run test:e2e
```

浏览器检查覆盖未填 token 的提示、shadcn/ui 图层交互、后端失败提示，以及真实本地模型瓦片请求与视图切换。它不伪造 Mapbox／天地图授权；底图和二维完整叠加需填写有效 token 后验收。

验收建议：确认 DOM 实际成像、道路与影像的平面套合、三维模型位置与高程、缩放时细节加载，以及关闭／打开各图层的显示结果。能读取配置和模型入口不等同于完成空间精度验收。

首次接入已核验：249 个 tileset 文档共引用 26,105 个文件，无缺失；真实 DOM 瓦片经过前后端代理返回有效 PNG；本地三维模型在浏览器中完成渲染。生产构建、TypeScript、5 项后端测试和 2 项浏览器测试通过。Mapbox／天地图在线底图与 PostgreSQL 连接仍待填写凭据后验证。

## 参考

- [Mapbox 官方 WMS 接入示例](https://docs.mapbox.com/mapbox-gl-js/example/wms/)
- [Cesium 本地资源与离线配置](https://github.com/CesiumGS/cesium/blob/main/Documentation/OfflineGuide/README.md)
- [shadcn/ui Next.js 安装说明](https://ui.shadcn.com/docs/installation/next)
