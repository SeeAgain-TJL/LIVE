# Exterior Batch 1 · 实际外观与性能记录

日期：2026-11-04。基线 `0d0a2e0`，工作分支 `feat/planet-exterior`。本轮复用 `PlanetMesh` 与 `planet-texture.ts`，仅升级星球外部；没有修改 `LIVE` 工作区、星球内部、持久化结构或导航接口。

## 实现

| 类型 | 外观与材质 |
| --- | --- |
| 岩石 | 球面陨坑碗/坑缘、山脊、多尺度矿物颗粒、粗糙岩面 |
| 海洋 | 大陆、近岸浅海、深海、高地与极冠；海面低粗糙度，陆地高粗糙度；高中档独立薄云壳 |
| 冰冻 | 主裂隙/次级细裂隙、霜面颗粒、冰面与裂隙的粗糙度差异 |
| 气态 | 多尺度流带、局部风暴涡旋；禁用固体凹凸与金属效果 |
| 带环 | 气体表面与细环带、两级间隙、色温变化、沿用本体投影遮挡 |

颜色为 sRGB，线性表面图打包高度/粗糙度/云覆盖，避免颜色冒充地形。单位球面采样、接缝与极点约束、mipmap、有限各向异性及环带屏幕导数过滤减少纹理伪影；不使用外部资产、新依赖、几何置换或后处理。

| 档位 | 贴图尺寸（两张） | 球体分段 | 凹凸 | 海洋薄云壳 |
| --- | --- | --- | --- | --- |
| 低 | 256×128 | 32×24 | 关闭 | 关闭，天气烘焙进颜色图 |
| 中 | 512×256 | 56×40 | 岩石/海洋/冰冻 | 开启 |
| 高 | 1024×512 | 80×56 | 岩石/海洋/冰冻 | 开启 |

自动档继续沿用桌面中档、小屏/低核心设备低档的原有策略。自转与云层在 reduced-motion 下停止；预览和 VRM 实验继续兼容原 `low` prop。

修改文件：运行时 `src/components/three/{planet-texture.ts,planet-mesh.tsx,universe-scene.tsx}`；单元测试 `tests/planet-exterior.test.ts`、Chrome 回归 `tests/browser/planet-exterior.spec.ts`；复现脚本 `scripts/{capture-exterior-review.mjs,create-exterior-contact-sheet.mjs}`；本审阅、`docs/{PROGRESS,DECISIONS}.md` 和 `docs/exterior-batch-1/{before,after-first,after}.json`。共 13 个版本控制文件。

## 真实截图

原始 PNG 在 `artifacts-local/exterior-batch-1/before/` 和 `after/`，不提交大二进制文件。各自的 `review.html` 可查看完整实图。每张图为 Chrome 对真实 WebGL 页面的直接截图，没有重绘、生成式图像或替换背景。夹具明确标为外观验收示例，不代表用户经历；仅存在于临时浏览器 profile。

| 截图 | 文件（相对仓库根目录） |
| --- | --- |
| 三档五球全景 | `artifacts-local/exterior-batch-1/after/overview-{low,medium,high}.png` |
| 五类高档近景 | `artifacts-local/exterior-batch-1/after/{rocky,ocean,ice,gas,ringed}-high.png` |
| 海洋中/低档近景 | `artifacts-local/exterior-batch-1/after/ocean-{medium,low}.png` |
| 升级前同机位 | `artifacts-local/exterior-batch-1/before/` 中的同名截图 |
| 实际截图裁切拼图 | `artifacts-local/exterior-batch-1/after/contact-sheet.png`（原图裁切/缩放，标题位于截图之外） |

复用保存的相机 position/target、原始外观种子和配色。全景保留自转；五类近景启用 reduced-motion 固定自转，方便比较地貌。已有环、其他行星、标签及 HUD 也保留在实图中。星云、恒星与背景不在本轮改动范围。

## 测量方法与边界

Windows 11 专业版 10.0.26200 / Intel Core 5 220H / 15.55 GiB RAM / Intel Graphics，安装的 **Google Chrome 156.0.8078.80**，Playwright `channel: chrome`，headless、硬件 WebGL，ANGLE Intel D3D11（非 SwiftShader）。视口 1600×1000 CSS px、设备 DPR 1.5；场景 DPR 上限低/中/高为 1 / 1.35 / 1.5。

使用独立生产端口 `3320` 与临时 profile。基线先构建并采集，再以当前实现构建复测。预热约 2.5 秒；每档全景六个静止窗口、六个横向平移/阻尼窗口，每窗约一秒。移动组包含间歇平移与停稳，不能解释成持续运动压力测试。各类型近景三个高档窗口。截图在帧时窗口之外；帧时来自原有 `SceneMetrics`，是浏览器帧间隔，**不是 GPU timer**。draw calls/triangles/textures 是渲染器计数，不能当作 GPU 字节占用。

原始完整窗口、相机、资源计数、设备信息、控制台记录和截图 SHA-256 见 [before.json](exterior-batch-1/before.json) 与 [after.json](exterior-batch-1/after.json)。下表 p95 为六个窗口的 p95 上界，不是合并样本重新计算的分位数。

| 画质 | 基线静止 FPS / p95 ms | 最终静止 FPS / p95 ms | 最终平移/阻尼 FPS / p95 ms | 三角形 基线→最终 |
| --- | --- | --- | --- | --- |
| 低 | 60 / 17.6 | 60 / 18.2 | 60 / 17.8 | 36,202→28,882（−20.2%） |
| 中 | 60 / 17.4 | 60 / 17.5 | 60 / 18.8 | 112,066→85,250（−23.9%） |
| 高 | 60 / 18.6 | 60 / 18.5 | 58–60 / 18.6 | 129,766→137,110（+5.7%） |

三档最终静止平均帧时均约 16.66–16.67 ms，draw calls 为低 26 / 中高 30（基线中高 29，增加海洋云层一个 draw）。高档平移窗口有 **50.7 ms** 长帧；五类高档近景，岩石/海洋/冰冻/带环三个窗口均为 60 FPS，气态为 58–60 FPS，气态最大帧时 **51.5 ms**。不能把短窗口的 60 FPS 当作长期帧率承诺。

保留最终版本的另一轮 [after-first.json](exterior-batch-1/after-first.json)：三档静止均 60 FPS，但高档平移降为 **39–55 FPS**，后半程五类近景范围 **22–52 FPS**（单帧最大 95.8 ms）。没有在该轮与复测间更改应用代码、画质、相机或烘焙算法；原因未定位，可能涉及设备/后台负载或运行时波动，不能归因断言。完整回归结束后，单独复测得到上表；两轮均保留，不能仅据较好的一轮宣称高档已达稳定 60 FPS。此前开发中间轮还有一次中档平移 44.1 ms 长帧，最终数据使用当前提交内容的两轮结果。

两轮画质往返纹理计数均为 11，几何体数均回到 27/31。切换窗口仍记录了约 **114–183 ms** 的最大帧时，属于首次/换档同步烘焙与 shader/贴图准备的实际局限；本轮没有把这类窗口混入预热帧率。控制台每轮初次主页均出现一条资源 404；没有 pageerror 或 shader/WebGL 错误，404 来源未在 response 事件中定位，没有为本轮改动无关资源。

## 实际检查

最终 `npm.cmd ci`、lint（无 warning）、strict typecheck、Node 单元测试 **46/46**、生产 build 通过；真实 Google Chrome 完整生产回归 **28/28** 通过（4.0 分钟）。新增单元测试覆盖五类确定性/种子变化、极点与接缝、改色不改变高度/粗糙度、海陆差异、颜色空间与释放；新增浏览器测试验证三档面数、画质往返 GPU 资源不累增及档案原文不变。原有进入/取消/返回、媒体 CRUD/刷新、引导、无 WebGL、移动模拟、内部生命世界/记忆空间/VRM 回归均通过。

首次完整回归为 27/28：新测试使用 `getByLabel` 精确定位而未命中实际下拉框，改为真实 combobox 角色与可访问名称。随后资源断言发现从高中档回低档会残留三张旧 bump sampler 纹理，低/高再次切换计数从 14 到 17。按 bump 开关重建材质变体后原严格断言通过，最终完整回归通过。资源序列 low→medium→high→low→high 均为 **11 张纹理**，几何体 **27→31→31→27→31**；包括场景其他资源，不是仅星球贴图。切换过程的瞬时烘焙/编译长帧单独保留在 JSON 的 `resources` 中，不能拿该过程声称稳定 60 FPS。

## 复现

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
# 独立终端启动生产预览
npm.cmd start -- --port 3320
# 另一终端：真实 Chrome 采样和直接截图
node --experimental-strip-types scripts/capture-exterior-review.mjs after
node scripts/create-exterior-contact-sheet.mjs
```

`before` 必须运行基线构建，不能对升级版运行该参数冒充基线。采集脚本不会读取日常浏览器配置或重置用户档案，只为当前临时 profile 写入显式 fixture。截图、完整浏览器 trace 与测试附件保留在忽略目录。

## 已知限制与下一步

这是程序化外部材质的第一批次，不是物理行星模型或最终美术验收。极近景仍可看出程序化地貌，气态条带与冰裂隙具有规律性；岩石陨坑为法线层次，轮廓不是真实置换。星环没有反投到球面的物理阴影；单点恒星光照可能使海面高光较强。新算法会改变同一种子的呈现图案，保存的种子、颜色和记录本身不变。

高档提升了纹理常驻容量；五颗星球本轮两张 RGBA8 图含 mip 的理论总量约 26.67 MiB，中/低档约 6.67 / 1.67 MiB。首次/换档纹理烘焙仍同步进行，预热帧率不代表冷启动没有停顿。尚未进行真实手机 GPU、其他浏览器、长时间资源压力或大量星球验收。下一步先由用户对照实图确认美术方向，再决定是否增加分帧/worker 烘焙或更精细的地质纹理。
