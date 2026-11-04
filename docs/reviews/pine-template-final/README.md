# Pine Forest · 最终视觉收口与模板预验收

**林缘连续性明显改善，低档性能达标；近景针叶的提升有限，本轮预验收没有全部通过。** 保留可运行、可恢复的候选版本，停止继续修改森林美术。没有建立“已通过美术验收”的冻结版本，也没有接入正式星球模板。

起点为本地、远端一致且工作区干净的 `63865d7`。阶段提交已推送：`052c67e` 近景针叶与 LOD、`53d2f14` 林缘接续、`fe58b10` 性能与回归。集中检查后，仅做一次最严重问题修正 `bb522f7`（细针束与清晰树干），下文最终截图和三档漫游均采自该代码。新旧资产目录并存，原 Blender、旧运行包、585 棵源树位置、60 个源分区和 879,825 条源地被记录保留。未修改正式 Galaxy / Planet / Memory、存储结构或 main。

## 视觉材料与判断

[Blender / 上一版 / 最终候选同机位](source-camera.webp) · [树冠近景 A/B](crown-comparison.webp) · [林缘抬高视角 A/B](raisedEdge-comparison.webp) · [全林俯瞰 A/B](panorama-comparison.webp)。Blender 图沿用原工程已存档的 Cycles 2 样本输出，关闭合成并简化细分；不是新制作的高质量 Cycles 成片。浏览器 A/B 均为相同位置、朝向、FOV 48.5°、1440×900 窗口、高档 80% 内部分辨率。水面与流送时序可能有帧间差异。

[近景树冠](crown.webp) · [源相机近景](near.webp) · [正常行走中景](walkMid.webp) · [正常行走远景](walkFar.webp) · [废墟](ruins.webp) · [抬高远景](far.webp) · [接近森林边缘](edge.webp) · [约 41m 抬高接缝检查](raisedEdge.webp) · [完整俯瞰](panorama.webp)。[九机位原始记录](stills.json)保留实际相机、流送及绘制统计；全景显示全部 585 棵源树。截图使用验收相机，录像使用正常输入控制，两者用途不同。

| 验收问题 | 最终判断 |
| --- | --- |
| 近景树木是否足够自然？ | **尚未通过。** 三种代表树增加同源、同朝向细针束，部分轮廓更连续；2–10m 仍有明显裸枝，源细枝的体积与透射没有充分恢复。与上一版相比，近景不是显著的整体跃升。 |
| 正常探索时边界是否自然？ | 原地形与外延地面共用 PBR 和边界高度，951 个补景树按真实根部落地，消除了原先突兀的单色地面接缝。采样地面、约 41m 抬高视角没有看到明显断裂或悬空；靠近边缘仍能辨认平面补景和重复地表，不能算完全自然。 |
| LOD 切换是否影响沉浸感？ | 近远冠层空间混合、加载淡入与相邻图集视角混合减少硬切。录像复核发现部分树干在过渡中偏绿：树干跳过淡化 Shader，但实例仍写入了作为权重的 RGB 通道，这是本轮留下的实现缺陷。图集平面感、虚影和部分地被切换也仍可见。此项没有完全通过。 |
| 低档连续漫游是否稳定？ | 本机同路线达到 60.04 FPS / P95 16.8ms，三档无捕获页面/资源错误、context loss 或档案访问；详见下表。 |
| 是否可以进入正式星球模板开发？ | **暂不建议作为已封版森林进入正式模板。** 自由漫游、碰撞、流送、分档和资源恢复能力可复用；近处枝叶表示、接近林缘的图集平面感及过渡时树干染色仍需解决。停止在候选检查点，交用户验收。 |

本轮没有重制地形、河流、废墟或流式架构。保持三种代表树的针叶补偿在 8.5–12m 淡出，并沿用原来的近景选择预算；没有为细微差异扩大高模可见范围。外围只补画面，不增加可行走面积或远景树数量。源场景材质的 Cycles 透射、真实体积雾、场景几何水面反射仍是已有实时近似；原地被记录没有全部同时绘制，林下覆盖场不能替代所有真实遮挡。原资产恢复/降级清单沿用[整林记录](../pine-final/README.md)，本轮变化如上。

## 同路线性能 A/B

生产构建、系统 Chrome 156.0.8078.80 无头模式、Intel Graphics / ANGLE D3D11、1440×900、DPR 1。上一版 `63865d7` 与最终 `bb522f7` 使用相同四段真实 W 输入（12 / 10.5 / 10.5 / 9 秒）及段间鼠标转向；不通过脚本改相机坐标。每档新浏览器会话、每配置一次样本，帧率与碰撞使实际路线略有偏差。FPS/P95 是约 42 秒按键窗口的浏览器帧间隔；不混入启动、等待和段间拖动，不等于 GPU 查询时间。

| 档位 | 内部分辨率 | 上一版 FPS / P95 | 最终 FPS / P95 | 首次就绪 / 首轮补齐 | 判断 |
| --- | --- | --- | --- | --- | --- |
| [低](walk-low.json) | 70%，1007×630 | 58.48 / 17.1ms | **60.04 / 16.8ms** | 4.44 / 7.08 秒 | 本机本路线满足 ≥30 FPS、P95 ≤40ms |
| [中](walk-mid.json) | 80%，1152×720 | 60.06 / 16.9ms | **59.98 / 16.9ms** | 4.90 / 7.63 秒 | 本次路线流畅 |
| [高](walk-high.json) | 100%，1440×900 | 34.70 / 50.0ms | 35.30 / 49.8ms | 5.55 / 7.21 秒 | 核显有长帧，面向更强硬件 |

[A/B 汇总](performance.json)。基线原始数据在[性能阶段目录](../pine-template-runtime/README.md)；该目录的“修改后”是修正前 `53d2f14`，最终以本表为准。没有明显性能退化，不把小幅差异归因于单项优化。加载为本机 HTTP、无网络限速、OS 缓存可复用的结果，不是跨网冷下载或所有硬件承诺。默认无参数入口为低档 70%，不会自动升至高档。

[真实 WASD + 鼠标连续漫游（65.84 秒 WebM）](https://github.com/SeeAgain-TJL/LIVE/releases/download/pine-template-review-20261104/pine-template-walk.webm)：1440×900、VP9、25fps 编码，未剪辑，包含加载、四段约 42 秒 W 与鼠标转向，随后真实 A / S / D，位移约 2.86 / 6.82 / 3.27 米。没有 review 相机、瞬移或预设相机动画。[录制采样](walk-recorded.json)为 59.94 FPS / P95 16.9ms，编码帧率不等于浏览器帧率。[视频完整解码与摘要](video.json)；附件上传核对服务端 SHA-256，视频不做独立回下载。

## 回归与可复用能力

- 最终代码 lint、typecheck、46 项单测、生产构建通过；2 项正式 travel-comfort 浏览器回归通过，未跑其余正式 E2E 或真实手机。
- [恢复资源浏览器检查](restored-runtime.json)：独立目录提供全部请求资源，实际请求 156 项；默认低 70%，低→中→高→低均加载完成，发生真实 GPU buffer / texture 删除。三档实走也有分区、批次和材质释放记录；计数不等于显存实测。
- 用真实 W 从 x=89 走到 x=99.4734 停在原地块边界；不开放补景行走。源[废墟代表边界](../pine-template-runtime/ruin-collision.json)通过，不保证所有拱下通道。
- [上下文恢复](../pine-template-runtime/context-recovery.json)在本轮性能阶段显式触发并恢复；不是承诺所有驱动故障都能原地恢复。
- 独立 `/forest-runtime-lab` 保留真实 Three.js 场景、WASD / 鼠标、源地形导航、树干/废墟碰撞、源分区流送、三档预算、地标与林缘补景；没有正式数据 Provider 或档案读写。

## 另一台设备恢复

代码使用 `codex/pine-forest-vertical-slice` 的本轮交付检查点。运行资源按以下顺序解压到不同目录，ZIP 内均为 `runtime/`；旧包不删除，新目录增量不覆盖不同内容。

| 顺序 | Release 与 ZIP | 校验清单 |
| --- | --- | --- |
| 1 | [Batch6](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch6-landmarks-20261104)，`pine-batch6-runtime.zip` | [209 项](../pine-batch6/runtime-assets.json) |
| 2 | [整林美术](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-environment-20261104)，`pine-final-art-runtime.zip` | [4 项](../pine-final-art/runtime-assets.json) |
| 3 | [性能增量](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-runtime-20261104)，`pine-final-runtime.zip` | [12 项](../pine-final-runtime/runtime-assets.json) |
| 4 | [上一轮视觉](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-visual-finish-20261104)，`pine-visual-finish-runtime.zip` | [14 项](../pine-visual-finish-art/runtime-assets.json) |
| 5 | [本轮最终针叶](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-template-closure-correction-20261104)，`pine-template-crowns-v2-runtime.zip` | [4 项](../pine-template-crowns-v2/runtime-assets.json) |
| 6 | [本轮林缘](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-template-edge-20261104)，`pine-template-edge-runtime.zip` | [3 项](../pine-template-edge/runtime-assets.json) |

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-batch6/runtime-assets.json --from D:/pine/base/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-art/runtime-assets.json --from D:/pine/art/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-runtime/runtime-assets.json --from D:/pine/optimized/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-visual-finish-art/runtime-assets.json --from D:/pine/visual/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-template-crowns-v2/runtime-assets.json --from D:/pine/crowns/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-template-edge/runtime-assets.json --from D:/pine/edge/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs verify --manifest docs/reviews/pine-template-final/runtime-assets.json
npm.cmd ci
npm.cmd run build
npm.cmd start
```

打开 `/forest-runtime-lab`（本机当前审阅服务为 `http://127.0.0.1:3216/forest-runtime-lab`）。[合并清单](runtime-assets.json)共 246 个文件、288,493,417 字节；可选的 Batch5 河床样板与原始 4K 诊断包不在默认入口清单中。

[恢复证据](restoration.json)：本轮 v1 / v2 针叶运行和制作 ZIP、林缘 ZIP 从 GitHub 下载并核对服务端及本地 SHA-256；最终用 v2 + 林缘增量与既有 239 项基础资源组成空目录，逐项验证 246 项，并以浏览器请求该独立目录完成加载、切档、释放及边界检查。基础 239 项沿用先前已验证本地副本，没有再次整包下载。**这是同机独立目录恢复，不是第二台物理设备实测。**

制作资产：最终针叶 Release 同时提供 `pine-template-crowns-v2-authoring.zip`，包含三个无压缩派生 GLB 与构建脚本；已重新下载并在 Blender 4.4.3 实际导入三份 GLB，见[制作资产恢复](authoring-restore.json)。没有修改或新增 `.blend`。完整原工程与纹理仍由 [Poly Haven 原始归档](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip)恢复，源 blend SHA-256 为 `fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb`。旧针叶 v1 发布与原始包继续保留。

本轮已用完一次集中制作和一次修正额度。剩余关键问题为近景实时枝叶体积、接近林缘时二维补景的空间表现，以及最后录像复核发现的树干过渡染色。前两者继续叠加同类针叶参数不能保证解决；第三项是已定位的权重通道处理缺陷。本轮按停止条件保留证据和候选，不将局部改善写成全面通过，不自动开展下一轮森林修复。
