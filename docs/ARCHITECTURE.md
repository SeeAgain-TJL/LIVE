# 技术架构与数据模型

## 当前实现（v0.1 原型）

```text
Next.js App Router
  /                         UniverseExplorer
  /planet/[id]              PlanetArchive
              ↓ typed props / actions
  UniverseProvider          状态与提交协调
              ↓
  UniverseRepository        load / save / schema 校验
              ↓
  LocalUniverseRepository   localStorage 快照 v1

UniverseExplorer → UniverseScene → CameraRig / PlanetMesh / StarField
PlanetEditor / PlanetArchive → PlanetPreview
```

Next.js 16 App Router + React 19 + strict TypeScript。3D 以 Three.js、React Three Fiber 9、Drei 10 构建；Tailwind 4 与语义化全局 CSS 实现界面。依赖目前只有版本范围，安装成功后必须提交 lockfile。尚未接通服务端数据库、鉴权或媒体 API。

业务规则在 `domain`，与 React 无关。`UniverseRepository` 是当前本地快照仓库接口，供 provider 使用；**它是同步的本地接口，不等于未来异步服务端仓库能直接原位替换**。接服务端时引入异步查询/命令接口及 loading/error 状态，保持领域类型、视图 props 与 3D 不变。

## 渲染与导航

- 宇宙 Canvas 客户端动态加载（`ssr: false`），SSR 不访问 WebGL 或浏览器存储。
- 确定性程序噪声生成本地 albedo，岩石/冰面 bump，标准光照、Fresnel 大气、径向星环 shader；恒星使用一个 Points 批次。没有外部贴图依赖或背景视频。
- OrbitControls 管理旋转、缩放和平移；CameraRig 用 `useFrame` 插值相机位置和观察目标，飞行期间暂停手动操作。
- 进入档案先飞近，再通过遮罩过渡到独立路由。返回链接与浏览器返回回到宇宙，通过可选镜头书签恢复位置；当前返回过程没有反向飞离动画，列为体验后续项。
- 相机只在操作结束/飞行完成写书签。坐标载入前校验有限数与范围；书签损坏不阻止档案读取。
- 自动模式以视口和 CPU 核数为启发式，并非 GPU 性能基准；手机/低核心设备固定 DPR=1、减少细分/星数，高质量 DPR 上限 1.75。未来补 FPS 退化与真实设备测量。
- WebGL 错误边界、context lost 提示、档案直达链接；列表和表单支持键盘，原生 dialog 负责焦点约束与 Escape。暂未完成真实浏览器与设备验收。

## 当前持久化契约

`UniverseData` v1 分离 `universe`、`galaxies[]`、`planets[]`、`memories[]`，通过 ID 引用。浏览器快照以 JSON 序列化，但业务实体独立，不把星球资料/全部记忆塞入一个不透明正文字段。

| 实体 | 当前字段 |
| --- | --- |
| Universe | id, name |
| Galaxy | id, name, color |
| Planet | id, universeId, galaxyId?, name?, startDate?, endDate?, ongoing, description, appearance, position, visibility=private, isDemo, createdAt, updatedAt |
| Appearance | type, color, seed, rings, size |
| Memory | id, planetId, kind=text, title, body, occurredOn, createdAt, updatedAt |
| Snapshot | schemaVersion=1, revision, universe, galaxies, planets, memories |

未命名名称存为 `null`；日期存 `YYYY-MM-DD`，代表日历日期而非 UTC 时间点；审计时间使用 UTC ISO 时间戳。无结束日期且不持续的有开始阶段，基础年份检索仅归入开始年份；持续阶段包含开始年至当前年。没有日期的草稿不匹配年份筛选。

读取时严格检查版本、日期、大小、ID 唯一性、星系/星球引用。保存先校验，再保留上一版快照后写主键。revision 检查减少跨标签页覆盖，`storage` 事件同步；localStorage 无跨进程事务，极短并发竞态仍需正式数据库解决。持久化错误不会提交应用状态或关闭表单。未知/损坏版本阻止写入，不重置个人数据。

导出目前仅 JSON v1（含文字，无媒体）；没有导入/恢复 UI。快照只保留上一版，不能替代异地备份。迁移时先导出主数据与快照，做纯函数迁移，验证计数/引用/正文，再显式提交新版本，并测试失败回滚。

## 正式服务端目标架构（尚未实现）

首选 Next.js Route Handlers / Server Actions + PostgreSQL + **Prisma**。认证供应商确定后接入成熟会话实现；服务端根据 session 定位 user，绝不接受客户端自报 ownerId。后端复杂度/媒体任务规模增大后才考虑 FastAPI。私有 S3 API 兼容存储，后续可切 Cloudflare R2。

```text
浏览器 → 鉴权与服务端授权 → Next API → Prisma → PostgreSQL
                           ↓
                     短期上传/读取授权
                           ↓
                       私有 S3 / R2
                           ↓
                队列/worker：缩略图、转码、病毒/格式校验
```

### 关系模型规划

下表是正式数据库设计方向，**不是已经启用的数据库 schema**。

| 模型 | 主字段与约束 |
| --- | --- |
| User | UUID id, 认证主体 unique, createdAt, updatedAt；会话独立管理 |
| Universe | UUID id, ownerId FK User + index, name, createdAt, updatedAt |
| Galaxy | UUID id, universeId FK + index, name, color, sortOrder |
| Planet | UUID id, universeId FK + index, galaxyId nullable FK, name nullable, startDate/endDate SQL DATE, ongoing, description TEXT, coverMediaId nullable FK, visibility private 默认, x/y/z, createdAt/updatedAt, version |
| PlanetAppearance | planetId PK/FK 1:1, type enum, baseColor, textureSeed, rings, size；新增材质参数需迁移 |
| Memory | UUID id, planetId FK, kind enum, title, body TEXT, occurredOn DATE, createdAt/updatedAt, version；index(planetId, occurredOn, id) |
| Media | UUID id, ownerId FK, objectKey unique（不可公开路径）, mime, bytes BIGINT, checksum, originalName, status, width/height/duration?, createdAt |
| MemoryMedia | memoryId + mediaId 联合唯一，sortOrder, caption；允许图文混合、一个记忆多个媒体 |
| PlanetConnection | UUID id, fromPlanetId/toPlanetId FK, type, label；去重并限制同宇宙，禁止自身连接 |
| SharePermission | UUID id, planetId FK, createdBy FK, subjectId? 或 hashedToken unique, scope read, expiresAt?, revokedAt?；原始分享令牌不落库 |
| MemoryReflection（后续） | UUID id, memoryId FK, authorId FK, body, createdAt；保留原始记忆，不覆盖过去 |
| Satellite（后续） | UUID id, planetId FK, name；经关联表组织多条记忆 |

外观是有限字段的结构化一对一模型；空间坐标为独立数值；内容与媒体关联采用表，不用无限增长 JSON。对可扩展特定材质参数，可使用小型版本化 JSON 但不得吞掉核心关系模型。封面 FK 必须验证媒体所有权；同一宇宙内星系/关联一致性需服务端与数据库约束共同保证。

删除策略：正式个人数据删除必须有可恢复策略/确认流程，避免 ORM 默认 cascade 静默删除媒体。对象删除在引用归零且恢复保留期结束后异步清理。

### API 规划

- `GET/POST /api/planets`、`GET/PATCH /api/planets/:id`，列表游标分页，可按年份/星系筛选。
- `GET/POST /api/planets/:id/memories`、`PATCH/DELETE /api/memories/:id`，版本冲突返回 409。
- `POST /api/uploads` 验证所有权、类型/大小/配额并发起单次或 multipart 上传；完成时校验对象与 checksum 后建关联。失败清理孤立上传。
- `GET /api/media/:id/access` 每次检查会话/分享 scope，返回短期私有 URL。guessable ID 不能获得访问权。
- 分享范围仅指定星球，不能通过媒体关联跨越授权范围；过期与撤销后拒绝新授权（已签 URL 的最迟失效时间取决于 TTL）。
- `POST /api/exports` 产生包含版本、文字、全部媒体与 manifest 的导出；导出对象本身也需私有和短期下载。

安全上传需校验真实文件类型、对象完成状态、配额、速率、CSRF 与会话；视频支持 Range/自适应播放的方案在媒体阶段确认。任何 S3 密钥仅服务端可见。

### 长期可靠性

Prisma migrations 纳入仓库，升级前备份，先加后迁再删，关键迁移做恢复演练。数据库定期备份 + 对象清单/校验，明确 RPO/RTO，导出必须能在全新环境还原。正式上线前测试匿名访问、横向越权、撤销分享、签名过期、恶意上传、断点恢复和数据恢复。
