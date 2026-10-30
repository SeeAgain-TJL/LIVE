# 技术架构与数据模型

## V4.0-A2 场景边界

`DeepSpace` 将固定背景预算拆为三维远星、中景星团、近景参照，叠加远处程序深空球与现有星云平面；`GalaxyCluster`/`GalaxyDisk` 继续由 ID 派生形态和厚度。`domain/spatial-scene.ts` 提供恒星位置、安全边界、倾斜轨道和弧线包络，均为纯计算。`UniverseScene` 把同一强类型 `StellarSource` 传给照明和 CameraRig，把光源位置传给 PlanetMesh；不从 3D 组件访问 Provider 或写业务档案。`universeOverview` 可接收不属于业务实体的取景边界，避免为恒星伪造 Planet 记录。

`SceneMetrics` 每秒采样帧间隔与渲染资源，投影来自真正渲染的近/远景参照顶点；相机平移、飞行、FOV 均由 Three/OrbitControls 控制。A2 没有 schema、数据库、人物或媒体接口变更。原相机键继续有效，默认新取景只作用于无书签的场景。


## V4.0-A1 渲染与导航（2026-10-30）

`domain/cosmic-visuals.ts` 定义确定性星系外观、空间采样和三档预算；不改变 Galaxy/Planet/Memory schema。`GalaxyCluster` 将三维星点/星尘与实时噪声星盘组合，`CosmicPoints` 每云一个批次并按相机距离平滑减少 drawRange；`CosmicEnvironment` 提供世界坐标恒星和层叠星云平面，非背景视频。没有新增后处理或外部贴图请求。

`GalaxyCamera` 独立控制宇宙飞行、取消回程和阻尼稳定后的书签；`GalaxyExplorer` 协调预取、单任务锁与短淡出，`CameraRig` 只增加一次性的星系到达推进，保留 B2 星球安全距离、取消和回程。`StellarNeighborhood` 使用原行星坐标生成装饰轨道与恒星照明，不改业务位置。

`data/cosmic-preferences.ts` 独立管理可选 `universe-of-me:cosmic-camera:v1`、`universe-of-me:cosmic-quality:v1`（localStorage）以及短期 `universe-of-me:galaxy-arrival:v1`（sessionStorage）。访问失败降级，不读写人生档案或 IndexedDB。`SceneMetrics` 每秒在 canvas 写一次诊断属性，用于浏览器采样，不每帧更新 React state。内存空间仍使用原渲染器和原画质逻辑。

## G2.1 制作路线变更（2026-10-30）

Blender 工具链已可用，但程序化人物草稿经用户审查不通过，只保留作技术归档，不延续为正式底模。当前 [VRoid 评估](character/g2-1/VROID-ASSESSMENT.md)建议另建可编辑 `.vroid`，人工完成脸/眼/发；必要时导出到 Blender 精修，分支 `.blend` 与 `.vroid` 不承诺双向同步。现阶段尚未安装或验证 VRoid 编辑器，也没有新模型。资产仍在仓库外独立版本化，官网/许可与真实模型校验另记录，不接入网站、不改存储或既有实验。下节是前一轮资料边界的历史记录。

## G1.5 / G2.1 资料边界（2026-10-29）

`docs/character/g1-5/` 存两张当前角色基准、SHA-256、可复现裁切/等比对齐脚本及独立离线核对页；不属于 Next 路由、不加载模型、不读取浏览器存储，不称作 3D 预览。当前没有可交付的新模型，后续 G2.1 使用可编辑 `.blend`、自包含 GLB 和真实转台验形，复杂 VRM 绑定后置。原正式引导者、VRM 实验、导航与存储保持不变。

## C3 资产生产架构提案（2026-10-29，尚未实现）

本轮仅进行原创角色与动画前期设计，不改运行时。复用只读实验、加载/释放、事件任务、真实目标和掌心锚点；现有程序姿态后续由精修 VRMA 片段替代。模型、六表情映射、片段、事件标记、额外骨轨道、控制权、掌心标定和来源许可需组成同版角色包，详见 [生产规范](character/PRODUCTION.md)。

VRMA 3.5.5 接口支持人形骨旋转、hips 位移、表情与 LookAt，不把任意狐耳/服装骨当标准 humanoid 轨道；这些需同版模型专用轨道适配或自定义表情。该适配器、分层控制和新的模型尚未制作，不能因已有导入按钮就宣称完整支持。正式 GuideProvider、四层导航、存储 schema、localStorage/IndexedDB 均保持原样。

## VRM 实验边界（2026-10-29）

新增 `/guide-lab`，不替换正式引导者。RootLayout 的 `ApplicationBoundary` 在实验路径跳过 UniverseProvider/GuideProvider/GlobalGuide，避免挂载正式 provider 后执行存储迁移或偏好写入；其余路由继续共享原有全局实例。`data/guide-lab-reader.ts` 只读原始档案并在内存中校验、规范化，不初始化示例、不保存、不打开 IndexedDB。

`domain/guide-lab.ts` 的纯事件状态机携带 run ID，分离请求、骨骼就绪、指引完成、真实相机到达、真实球体到掌心等事件。`components/guide-lab/rig-controller.ts` 使用 VRM normalized 骨骼、AnimationMixer 轨道和双骨 IK，`lab-scene.tsx` 只接收 typed props 并协调模型、空间目标、相机和每秒测量，业务数据查找仍留在 `guide-lab.tsx`。未每帧写业务 React state。

依赖 `@pixiv/three-vrm` 与 `@pixiv/three-vrm-animation` 固定 3.5.5，保持 Three.js 0.180.0；VRM1 的 MToon、表情、LookAt、spring bones 使用官方插件。资产为授权官方技术样本，来源/许可/散列与最终原创资产契约在 `public/characters/guide-lab/`。A/B 相机导航仅发生在实验 Canvas；正式 B2 旅行未接入实验控制器。

模型切换/卸载会停止 mixer、释放 VRM GPU 资源与本地 object URL；加载失败可重试。实验限制自包含 VRM1/VRMA、不请求第三方贴图，不将记忆或本地导入文件上传。详细流程与实际视觉限制见 `GUIDE-LAB.md`。

## 当前实现（本地开发原型，V3.0-C 交互版；最终人物资产待制作）

```text
Next.js App Router
  /                         GalaxyExplorer → GalaxyScene
  /galaxy/[id]              UniverseExplorer → 当前星系的星球
  /planet/[id]              PlanetMemorySpace
              ↓ typed props / actions
  UniverseProvider          状态与提交协调
              ↓
  UniverseRepository        load / save / schema 校验
              ↓
  LocalUniverseRepository   localStorage 快照 v2（兼容 v1）
  MediaStore                IndexedDB Blob

UniverseExplorer → UniverseScene → CameraRig / PlanetMesh / StarField
PlanetEditor → PlanetPreview
RootLayout → GuideProvider → GlobalGuide（跨路由唯一实例）
PlanetMemorySpace → MemoryToolbar / MemoryGuideBridge / MemoryList / MemoryDetails
                 → MemorySpace → MemoryOrb / MemoryCamera / StarField
```

Next.js 16 App Router + React 19 + strict TypeScript。3D 以 Three.js、React Three Fiber 9、Drei 10 构建；Tailwind 4 与语义化全局 CSS 实现界面。已生成 `package-lock.json`，使用 `npm ci` 复现；本轮实际解析为 Next.js 16.4.3、React 19.3.1、R3F 9.8.2、Drei 10.7.9。尚未接通服务端数据库、鉴权或媒体 API。

业务规则在 `domain`，与 React 无关。`UniverseRepository` 是当前本地快照仓库接口，供 provider 使用；**它是同步的本地接口，不等于未来异步服务端仓库能直接原位替换**。接服务端时引入异步查询/命令接口及 loading/error 状态，保持领域类型、视图 props 与 3D 不变。

## 渲染与导航

- 宇宙 Canvas 客户端动态加载（`ssr: false`），SSR 不访问 WebGL 或浏览器存储。
- 确定性程序噪声生成本地 albedo，岩石/冰面 bump，标准光照、Fresnel 大气、径向星环 shader；恒星使用一个 Points 批次。没有外部贴图依赖或背景视频。
- OrbitControls 管理旋转、缩放和平移；CameraRig 用 `useFrame` 插值相机位置和观察目标，飞行期间暂停手动操作。
- 单击 3D 星球启动 `usePlanetJourney` 的单一任务，CameraRig 接近完成后遮罩转场并进入独立记忆路由。Escape 清除待导航定时器，反向恢复出发视角；飞行期间暂停控制并拦截重复进入。DOM 指针累计移动、时长和触点数共同防止拖动误入。
- 镜头书签按星系保存：进入前记录出发位置，抵达近景不覆盖它。`PlanetExitLink` 淡出记忆空间后返回所属星系；CameraRig 从星球外部恢复原视角。直接 URL 没有有效会话时使用所属星系书签/全景。坐标载入前校验有限数、范围与相机目标距离，损坏不阻止档案读取。
- 自动模式以视口和 CPU 核数为启发式，并非 GPU 性能基准；手机/低核心设备固定 DPR=1、减少细分/星数，高质量 DPR 上限 1.75。未来补 FPS 退化与真实设备测量。
- WebGL 错误边界、context lost 提示、档案直达链接；列表和表单支持键盘，原生 dialog 负责焦点约束与 Escape。Chrome 自动化已验证创建/进入/文字持久化与移动视口草稿；实际手机与性能验收待完成。
- Drei Html 标签通过独立 DOM portal 层渲染，避免向 Canvas 自身容器附加节点导致 React 切页卸载冲突。此问题通过真实 Chrome 路由切换测试发现并回归验证。

## 当前持久化契约

### C 全局角色与 UI 偏好（不升级人生数据）

RootLayout 的唯一 GuideProvider/GlobalGuide 沿用，拆分为 GuideCharacter（资产与状态）、GuideDialogue（交谈）、GuideSearchPanel（真实数据查找）、useGuideFloating（指针/键盘/限位/停靠避让）、useGuideNavigation（已有路由协调）。3D 组件不读取人物状态；页面业务层回报 `GuideCue`，`domain/guide-lines.ts` 管理六状态短句，静音后仍更新忙碌/人物状态而不主动弹台词。首次载入延后台词直到恢复偏好，5 秒收起短提示，不强制展开对话。

`data/guide-preferences.ts` 独占 localStorage 的 `universe-of-me:guide:v1`，结构 `{version:1, edge, heightRatio, hidden, dialogueOpen, promptsEnabled}`。高度为 0..1，适应窗口变化。读取不写默认，未知/损坏版本保留原文并禁用写回，错误不阻止宇宙/档案。写入失败保留 UI 会话状态并提示；storage 事件恢复其他标签页的合法偏好。无旧引导 UI 持久化版本需要迁移；主档案/恢复快照/IndexedDB 完全沿用。

`domain/guide-companion.ts` 提供纯偏好校验、布局限位和跨星球记忆筛选。面板每次最多显示 20 项，可继续加载；结果打开受控 `/planet/<id>?memory=<id>`，星球页校验所属关系、明确选择并消费 URL，重复查找同一记忆仍可打开，不影响正常关闭/刷新。

人物资产统一在 `character-assets.ts`，可按六状态提供透明本地图，缺失状态回退基础图、载入失败回退标记预览。当前 `status=preview/source=null`，原创全身 SVG 仅为开发预览；高质量最终资产未产出。具体契约见 `public/characters/memory-guide/README.md`。没有新依赖、AI、语音或第三方素材网络请求。

B2 的 `data/exploration-session.ts` 仅管理可选的 `sessionStorage` 导航上下文，键为 `universe-of-me:visit:v1:<encoded planetId>`，包含 planetId、galaxyId、origin 与 arrival 镜头。读取验证星球/星系匹配和有限向量，失败安静回退；不是人生档案，不参与 schema v2、revision、迁移或媒体数据库。每次进入覆盖该星球本标签页上下文；关闭标签页可能失效，主数据不受影响。浏览器原生历史返回继续使用原有路由与星系书签，产品内「返回所属星系」提供完整的反向过渡。

`domain/planet-flight.ts` 纯函数计算沿当前视线的外部取景，考虑 FOV、宽高比、星环边界与既有安全投影；渲染仍使用原有 PlanetMesh 材质和大气。CameraRig 用 ref/useFrame 插值，同时接管相机与 OrbitControls target，清除残余 damping 后再开始，避免第一帧方向跳变。`usePlanetJourney` 阶段为 idle/flying/approaching/transition/returning/cancelling，ref 防止 React 提交前重复启动，卸载清理导航定时器。WebGL 失败解锁 UI，档案按钮直接导航，不依赖缺失的镜头回调。

引导者 `announce` 只负责可关闭的自动短句；`say` 继续服务用户主动查找。`MemoryGuideBridge` 每次星球挂载欢迎一次，不复制或上传正文。`planet-journey.css` 仅补进出遮罩、悬停信息与状态提示，既有宇宙和记忆布局不重写。

`UniverseData` v2 分离 `universe`、`galaxies[]`、`planets[]`、`memories[]`、`media[]`，通过 ID 引用；v1 在读取时兼容。浏览器快照以 JSON 序列化，但业务实体独立，不把星球资料/全部记忆塞入一个不透明正文字段。

| 实体 | 当前字段 |
| --- | --- |
| Universe | id, name |
| Galaxy | id, name, color |
| Planet | id, universeId, galaxyId?, name?, startDate?, endDate?, ongoing, description, appearance, position, visibility=private, isDemo, createdAt, updatedAt |
| Appearance | type, color, seed, rings, size |
| Memory | id, planetId, kind=text/mixed, title, body, occurredOn, mediaIds, createdAt, updatedAt |
| Media | id, memoryId, kind=image/video, name, mimeType, size, createdAt；Blob 由相同 ID 关联 IndexedDB |
| Snapshot | schemaVersion=2, revision, universe, galaxies, planets, memories, media |

未命名名称存为 `null`；日期存 `YYYY-MM-DD`，代表日历日期而非 UTC 时间点；审计时间使用 UTC ISO 时间戳。无结束日期且不持续的有开始阶段，基础年份检索仅归入开始年份；持续阶段包含开始年至当前年。没有日期的草稿不匹配年份筛选。

读取时严格检查版本、日期、大小、ID 唯一性、星系/星球引用。保存先校验，再保留上一版快照后写主键。revision 检查减少跨标签页覆盖，`storage` 事件同步；localStorage 无跨进程事务，极短并发竞态仍需正式数据库解决。持久化错误不会提交应用状态或关闭表单。未知/损坏版本阻止写入，不重置个人数据。

导出目前为 JSON v2（含文字与媒体元数据，不包含 Blob）；没有导入/恢复 UI。快照只保留上一版，不能替代异地备份，原始媒体需要另外保留。迁移时先导出主数据与快照，做纯函数迁移，验证计数/引用/正文，再显式提交新版本，并测试失败回滚。

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

## Phase 2 local media boundary

UniverseData v2 adds Memory.mediaIds and Media metadata. Image and video Blobs are stored in IndexedDB (universe-of-me-media) while localStorage keeps the validated versioned relationship snapshot. src/data/media-store.ts is the replacement boundary for a future private S3/R2 adapter. Legacy v1 snapshots are normalized on read; corrupt or orphan references fail closed without overwriting the original data. Production still requires Prisma relations, authorization, short-lived object URLs, backup, and full export/recovery.

## 星穹记忆殿堂

src/components/three/memory-space.tsx 只负责渲染记忆球、相机和 OrbitControls；src/domain/memory.ts 提供纯函数的媒体类型、搜索、筛选和空间坐标；planet-memory-space.tsx 负责将当前星球真实数据组合为页面。全局引导者经 MemoryGuideBridge 触发本地确定性动作，memory-details.tsx 负责 HTML 长文和媒体阅读，MemoryList 是辅助管理模式。这样 3D 渲染不会直接读写 provider，也不会把正文绑定到旋转球面。

V3 任务 A 将球体与相机拆到 `memory-orb.tsx`、`memory-camera.tsx`，布局样式独立于宇宙主页。选择以 `selectedId` 为唯一明确状态，不从筛选数量推断；详情在场景和列表两种模式均可打开。非模态抽屉允许继续访问相邻操作，Escape 遇到原生编辑/删除 dialog 时让其优先处理。相机仅在选择、数量或视口变化时飞行，完成后释放控制。所有这些变化不升级持久化 schema。

## B1 星系与全局引导边界

Galaxy 仍为独立的 `id/name/color` 记录。`domain/galaxy.ts` 提供关系规范化、确定性星系坐标和目的地 URL；不把虚构经历写入数据。初次演示包含未分类及四个原有主题星系，五颗未命名外观示例属于未分类。真实旧档案只保留原有星系并补默认项，不补造用户星球或经历。星系视觉位置由顺序确定，不更改已有 Planet.position。

`LocalUniverseRepository.load` 在校验通过后执行幂等关系迁移：缺失/null 归属归入 `unclassified`，保留已分类归属。首次写入前将完整原文存入 `universe-of-me:before-galaxies:v1`（不覆盖），确认主键未变后提交规范化 v2；不递增 revision，不操作 IndexedDB。无效版本或悬空非空归属拒绝迁移；配额失败保留原文/已完成备份并报错。测试验证备份原文、重复读取不写入、失败重试及从备份恢复相同档案。

`GlobalGuide` 挂在根布局、与页面并列；折叠/隐藏、左右边缘、查询与短台词跨客户端路由保留。SVG 为项目原创矢量插画，无第三方角色资源。`GuideProvider` 只管理 UI 和当前页面注册的动作；不复制记忆、不存储用户正文。页面以稳定 bridge 注册/卸载真实记忆查找动作，星球预览/阅读时自动紧凑，原生 dialog 打开时让出交互。拖动仅横向移动并吸附左右边缘，方向键也能切换边缘；不是自由二维角色编辑器。

目的地导航通过一次性的 `travelGalaxy/travelPlanet` 命令进入根页面，先调用星系相机飞行，再进入星系的星球相机，最后复用记忆页面。命令启动后用 replace 消费，防止刷新或浏览器返回重复启动；每次请求带 trip。正常返回使用宇宙/所属星系链接，保留 `?planet=id` 作为预览选择。星系相机书签按 galaxy ID 隔离；无 WebGL 可使用星系直达、档案直达链接，星系飞行还可跳过。反向飞离仍未实现。

## G2.1 DCC 资产边界（2026-10-30）

角色制作工程与网站运行时保持分离。Blender 脚本位于 `scripts/blender/`，只负责可复现的验证、草稿生成、重新打开检查和外部审阅页打包；它不读写 UniverseProvider、localStorage、IndexedDB，也不改变正式引导者。模型、贴图、视频和安装包保存在仓库外的版本目录，仓库只保存来源、许可、SHA-256、生成参数和小型 JSON 证据。

当前 `silver-spirit-draft01` 是可编辑的静态基础研究，不是生产 VRM。只有技术 mannequin 通过 VRM 1.0 导入/导出烟测；角色草稿在脸部、头发、服装、权重、表情和物理完成前不得接入 `/guide-lab` 或正式页面。未来正式模型应以独立版本目录交付，先做静态外形验收，再做绑定/动画验收，最后才由运行时适配器加载。
