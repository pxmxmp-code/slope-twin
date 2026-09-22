# Slope Twin

边坡二维正射影像、居民地要素与三维实景模型浏览应用。

## 运行模型

项目只有两种运行方式，不再混用：

| 场景     | Web / API                        | PostGIS / GeoServer / MinIO |
| -------- | -------------------------------- | --------------------------- |
| 日常开发 | 本机进程，支持热更新             | 统一使用 `192.168.1.110`    |
| 最终部署 | Docker Compose 中的 `web`、`api` | 仍使用 `192.168.1.110`      |

Compose 不创建数据库、GeoServer 或 MinIO，也不用于开发。3D Tiles 始终由 API 从服务器 MinIO 流式代理，不再读取仓库下的本地瓦片目录。

## 目录

```text
apps/
├── api/
│   ├── app/config.py          # 唯一配置模型
│   ├── app/infrastructure.py  # PostGIS、GeoServer、MinIO 访问
│   └── app/main.py            # FastAPI 装配与路由
└── web/
    ├── app/                   # Next.js 入口与样式
    └── components/            # 工作台、地图视图与独立控制面板
docker/                        # 仅最终部署使用的镜像
docker-compose.yml             # 仅 web + api
.env.example                   # 唯一环境变量模板
```

## 本机开发

要求 Node.js 22、npm、Python 3.12+ 和 uv。

```bash
rtk cp .env.example .env
rtk npm install
rtk proxy uv sync --project apps/api
rtk npm run dev
```

打开 <http://127.0.0.1:3000>。Web 在 `127.0.0.1:3000`，API 在 `127.0.0.1:8000`，两者都有热更新。

也可以分别启动：

```bash
rtk npm run dev:web
rtk npm run dev:api
```

`.env.example` 已把所有基础设施指向服务器：

- PostGIS：`192.168.1.110:25432`
- GeoServer：`http://192.168.1.110:8080/geoserver/ne/wms`
- MinIO：`http://192.168.1.110:29000`
- Bucket：`slope-twin`

只需补充 `MAPBOX_TOKEN` 和可选的 `TIANDITU_TOKEN`。数据库密码如已调整，也只修改本机 `.env`，不要提交。

## 最终部署

服务器准备好 `.env` 后执行：

```bash
rtk docker compose up -d --build
```

默认发布 Web `23002`、API `8000`。Compose 内 Web 通过 `http://api:8000` 访问 API；API 继续使用 `.env` 中的 `192.168.1.110` 基础设施地址。

```bash
rtk docker compose ps
rtk docker compose logs -f api web
rtk docker compose down
```

`down` 只移除本项目 Web/API 容器，不会触碰数据库、对象存储或其数据。

## 配置

| 变量                              | 用途                                                |
| --------------------------------- | --------------------------------------------------- |
| `MAPBOX_TOKEN`                    | 二维 Mapbox GL 引擎的浏览器公共令牌                 |
| `TIANDITU_TOKEN`                  | 天地图矢量底图与中文注记；为空时使用 Carto 浅色底图 |
| `BACKEND_URL`                     | Next.js 同源代理目标；本机为 `127.0.0.1:8000`       |
| `DATABASE_URL`                    | API 访问服务器 PostGIS                              |
| `GEOSERVER_WMS_URL`               | API 访问服务器 DOM WMS                              |
| `GEOSERVER_WFS_URL`               | API 访问服务器等高线 WFS                            |
| `GEOSERVER_DOM_LAYER`             | DOM 图层名                                          |
| `GEOSERVER_CONTOUR_LAYER`         | 三维场景使用的等高线图层名                          |
| `GEOCLOUD_WMS_URL`                | 全国 1:50 万地质图 WMS 完整地址（含 `tk`）          |
| `GEOCLOUD_WMS_LAYERS`             | 地质图子图层，默认 `t0` 至 `t12`                    |
| `MINIO_ENDPOINT` / `MINIO_BUCKET` | API 访问服务器 3D Tiles                             |
| `DOM_BOUNDS`                      | 项目范围，顺序为西、南、东、北                      |
| `GROUND_ELEVATION`                | 三维本地高程基准，当前取等高线最低值 `1208` 米      |
| `WEB_PORT` / `API_PORT`           | 最终容器部署端口                                    |

浏览器只访问 `/api/*` 和 `/tiles/*`。数据库地址、密码及内部服务地址不会由 `/api/config` 返回。

等高线由二维、三维场景共享同一个开关，并按视野尺度从 GeoServer 分级请求：远景 20 米、中景 10 米、近景 2 米，避免首屏加载全部 939 条曲线。

## 验证

```bash
rtk npm run typecheck
rtk npm run test:api
rtk npm run build
```

前后端启动后可运行浏览器测试：

```bash
rtk proxy npx playwright install chromium
rtk npm run test:e2e
```

健康检查地址为 <http://127.0.0.1:8000/api/health>，返回 API、数据库和模型入口的状态。
