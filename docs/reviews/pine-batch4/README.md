# Pine Forest Batch4 收尾（2026-11-04）

本批保留 `2e59615` 的三层源 PBR/path/river 混合及仅高档启用的 pine_04 真实中景 LOD；不继续材质或 LOD 美术实验。工程通过不代表整体视觉验收通过。

## 阶段一：代码验证与资产恢复

- 恢复时分支 `codex/pine-forest-vertical-slice`，HEAD `2e596154a43e0a3ee5d6d1f0703d18a6ed793361`，工作区干净；`92996b8`、`4e3337d`、`2e59615` 和 stash `batch4-wip-backup-20261104-100624` 均存在。
- 当前 HEAD 已实际执行并通过 lint、typecheck、46/46 单元测试与 production build；本轮接续时复用同一会话的检查结果。未把此前 LOD 调整前的结果当作新验证。
- `git ls-remote --heads origin refs/heads/codex/pine-forest-vertical-slice` 没有返回：初始时远端尚无本分支。这不代表提交在其他远端分支上完全不可达。
- 检查本地相对所有 remote refs 的待推送 Git 对象，没有超过 10 MiB 的新 blob。大型运行时资产不进入普通 Git 历史。
- 新增 `transfer-batch4-assets.mjs`，从实际低/高档 glTF URI 收集运行依赖，记录 207 文件 / 199,165,053 字节的 SHA-256 清单。实际导出后恢复到独立空目录，全部哈希相同；未在第二台实体设备验证。

### 换设备恢复

代码仓库本身**不包含森林运行资产**。需要同时携带独立的 `artifacts-local/pine-batch4/handoff/runtime/` 文件夹，或已生成的 `artifacts-local/pine-batch4/handoff/pine-batch4-runtime.zip`（191,288,175字节，SHA-256 `5786ab140700835fb23e914e71cc5e5db8c69d43f48f1d3d7986d44459f61c6c`）。该运行包未上传 GitHub，没有云下载地址；请通过迁移介质复制。范围包含低/高档和旧地面比较，不包含其他实验页的完整源资产。解压后得到 `runtime/`，按下方命令恢复。

```powershell
git checkout codex/pine-forest-vertical-slice
npm.cmd ci
# --from 指向迁移介质上的 runtime 文件夹；仅复制缺失文件，拒绝覆盖内容不同的已有文件。
node scripts/forest-lab/transfer-batch4-assets.mjs restore --from D:/pine-batch4/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs verify
npm.cmd run build
npm.cmd start
# /forest-runtime-lab?scale=0.8，或追加 &quality=high
```

开发美术时还需原始 `%LOCALAPPDATA%/UNIVERSE-OF-ME/asset-audit/candidate-assets/pine_forest.zip`（约 2.75 GB，含原工程和纹理）、从中解出的 `polyhaven_pine_fir_forest.blend`（SHA-256 `fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb`）、原有 `textures/`、Blender 4.4.3 和 gltfpack 1.3。当前脚本大量沿用该 LOCALAPPDATA 工作目录；仅 `npm ci` 不能重建这些资产。

Batch4 地面派生链：在字节相同且名为 `pine-forest-copy.blend` 的副本上运行 `export-batch4-terrain-layers.py` → `package-batch4-terrain-layers.mjs` → `rasterize-batch4-terrain-masks.mjs`。中景打包脚本消费已有 `artifacts-local/pine-batch4/mid-lod-trials/pine_04-mid-0.015.glb`；它没有自动生成这个输入，故不能声称单独运行打包脚本就能从全新设备复现。重新做源导出需要保留 `pine-source-conversion/` 派生工作目录及本批试验输入，或重新用原工程执行完整导出链。

`runtime-assets.json` 只记录资源与哈希，不包含用户档案。恢复脚本不访问浏览器存储。

阶段一提交 `222dfe7`，`git push -u origin codex/pine-forest-vertical-slice` 成功，远端分支与 upstream 已建立，包含此前三个 Batch4 提交。

## 阶段二：最终截图与 Blender 同机位对照

本轮从 production `127.0.0.1:3314` 的 Chrome 156.0.8078.80 截取；CSS 1440×900、DPR1、内部1152×720。保留原始 PNG 于忽略目录；下列 WebP 为同尺寸质量90派生审阅图。`stills.json` 保存实际相机、资源驻留和每机位5秒静止采样。

| 视图 | 证据 | 相机与范围 |
| --- | --- | --- |
| 近景低档 | [近景](near-low.webp) | 原始起点；针叶、树干、岩石及地表 |
| 中景低档 | [中景](mid-low.webp) | (-70,2,26)，方向(0,-0.04,-1)；Billboard中远景 |
| 远景低档 | [远景](far-low.webp) | (10,18,60)，方向(0.1,-0.5,-1)；抬高机位审阅树林整体 |
| 同机位高档 | [中景高档](mid-high.webp) | 同中景低档相机，实际驻留 `pine_04/mid` |
| Blender地表比较 | [三栏对照](blender-terrain-comparison.webp) | 左：原材质Cycles；中：历史Batch3B；右：本轮Batch4 |

截图审阅调用既有显式 `review` 相机接口；已断言实际位置与请求一致。此接口只用于静帧，连续漫游没有启用。低档断言没有加载真实中景、高档断言已加载，5张截图无浏览器错误或HTTP失败。

截图机位另取5秒静止样本（单次、未经严格环境控制）：近景低档42.73FPS/P95 33.5ms，中景低档25.38/66.6ms，抬高远景低档17.05/116.5ms，同中景高档17.34/83.9ms。远景大可见集与高档仍明显受限；不把地表单独隐藏植被时的59.94FPS当作森林性能。

Blender参考**复用** Batch3B 已生成的16-sample、降噪、720×450原始地表图，未重新运行Blender。与本轮地表视图共用位置、方向、48.5°垂直FOV和16:10比例。`reused-evidence.json` 保存相机及参考路径。两者分辨率、光照、色调映射、地面位移和纹理映射不同，且隐藏植被；只比较地表构图及材质损失，不能称为完整森林同画质。当前源工程与工作副本SHA-256均复核为 `fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb`，未保存改写。

复用 `tree-mid-ab3/results.json` 的门控前历史A/B：18/25/35m，forced-far为45.25/53.48/59.52 FPS，真实mid为31.55/30.21/43.29 FPS；对应资源驻留确认不同。不能当作当前低/高档严格单变量测试，因为当前高档还扩大其他几何范围。排除 `mid-lod-fps/results.json` 的“多机位”数据：其实际相机始终没变。原证据均保留，未覆盖。

### 剩余视觉问题

- 近景针叶仍偏稀、细枝偏硬；与源Cycles透射/遮罩和自然枝叶层次有明显差距。
- 地面比单张烘焙清楚，但重复频率、路径/河床覆盖及粗糙度/法线混合尚未与原材质等价；原岩石位移和高频起伏未恢复。三栏图中河床质感差异显著。
- 低档中远景仍为平面图集，无真实枝叶视差；几何/图集切换、固定光照及边缘重影仍可能可见。真实mid仅pine_04，高档其他树种没有同等升级。
- 林下覆盖截断和初次补齐弹出、整体照明/接触阴影、河水与体积氛围仍待下一阶段环境美术。当前高档在核显成本明显，未通过整体美术或性能门槛。

下一阶段只接续森林整体环境美术与其专项性能预算；本批不继续扩大LOD或重新开发地面。

阶段二提交 `d7a76fc`，Push 成功（`222dfe7..d7a76fc`）。本轮实际查看了近中远景、高档中景与三栏对照。

## 阶段三：连续漫游、性能和最终交付

使用已提交的 `verify-batch3-motion.mjs`，路线 `/forest-runtime-lab?scale=0.8`，没有 `review` 参数、相机位置赋值或相机事件。键盘真实W/A/S/D输入和鼠标按住拖动由既有Walker消费。录制从页面加载开始连续157秒，包含静止观察、前行、斜行、转向及后退；未剪辑。原1440×900 WebM在 `artifacts-local/pine-batch4/final-walk/continuous-movement.webm`（80,981,206字节），[720×450审阅版](continuous-walk-review.webm)（15,311,354字节）仅做空间/码率压缩并随Git同步；[六时点预览](video-timeline.webp)。两版均实际在Chrome解码、跳转12/35/65/100/125/150秒并播放验证，时长一致，没有媒体错误。

| 同机单次路线 | 移动输入段平均FPS | P95 / P99 | 超100ms帧 | 旧全路段门槛 |
| --- | ---: | ---: | ---: | --- |
| 不录屏 | 41.55 | 50.0 / 66.7 ms | 8 | 未通过 |
| 连续录屏 | 32.99 | 50.1 / 69.1 ms | 15 | 未通过 |

条件：Chrome156.0.8078.80 / Intel Graphics / ANGLE D3D11 / CSS1440×900 / DPR1 / 内部1152×720 / 低档。都是同机单次串行运行，没有同时执行另一项GPU/Blender任务；后台负载、温度等没有严格控制。当前统计包含按键被碰撞阻挡的时段，不能描述为所有时间都在移动。两次实际路线与停留点不同，不能据此给出精确录屏开销或受控回归结论。详细分段、位置/方向采样、驻留释放和检查结果见 [motion-summary.json](motion-summary.json)。

不录屏首次森林6.69秒/稳定10.73秒；录屏7.14秒/10.37秒。录屏期间释放27分区、16资源；不录屏28分区、13资源。两次浏览器错误、context事件、localStorage和IndexedDB访问均为零，行为断言通过；`passed=true` 不代表 `qualityTargetMet=true`。旧门槛为每个移动输入段平均至少30FPS且P95不超40ms，本轮两次均未达标。

Walker行走确实改变位置和方向，至少跨过数十米；录屏转向前到达x≈-69.99的行走边界，后退途中树干碰撞导致末尾部分输入不再移动。名为return的分段是**尝试返回**，最终距起点86.39m，未声称已绕行回起点。没有为录屏绕过碰撞或改动Walker。

### 交付与恢复验证

- ZIP解压到独立目录后，207资源重新SHA-256验证通过。
- 将浏览器所有 `/forest-origin-assets/*` 请求定向至该解压目录：低档146、高档159个实际请求均成功；地面就绪、WebGL正常、低档无真实mid、高档有真实mid。未读取本机原资产目录作为兜底。这是在同机隔离目录上的恢复验证，尚无第二台实体设备实测。
- 预置不同内容的terrain.glb后恢复被拒绝，原文件字节保留，未产生部分复制。结果见 [delivery-verification.json](delivery-verification.json)。
- 新增5个交接/采集/发布/验证脚本ESLint通过；恢复、视频解码、浏览器场景验证均通过。原运行时代码仍为 `2e59615`，未重新开发材质或LOD。
- 本轮未重新运行完整正式站点 `test:e2e`，未验证真实手机、其他GPU、长期显存稳定性或新设备；没有把原46项单元测试扩写为这些覆盖。
- 原始PNG、80MB视频、旧A/B和Blender工作资料继续在忽略目录；Git同步的是审阅图、轻量视频、结果摘要、脚本和文档。独立运行包和DCC资料需要另行复制。

Batch4收尾交付完成，整体环境美术与全路段性能仍未验收通过；下一阶段以以上实际问题和原始工程为输入，不重新执行本批已完成开发。
