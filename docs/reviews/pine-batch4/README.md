# Pine Forest Batch4 收尾（2026-11-04）

本批保留 `2e59615` 的三层源 PBR/path/river 混合及仅高档启用的 pine_04 真实中景 LOD；不继续材质或 LOD 美术实验。工程通过不代表整体视觉验收通过。

## 阶段一：代码验证与资产恢复

- 恢复时分支 `codex/pine-forest-vertical-slice`，HEAD `2e596154a43e0a3ee5d6d1f0703d18a6ed793361`，工作区干净；`92996b8`、`4e3337d`、`2e59615` 和 stash `batch4-wip-backup-20261104-100624` 均存在。
- 当前 HEAD 已实际执行并通过 lint、typecheck、46/46 单元测试与 production build；本轮接续时复用同一会话的检查结果。未把此前 LOD 调整前的结果当作新验证。
- `git ls-remote --heads origin refs/heads/codex/pine-forest-vertical-slice` 没有返回：初始时远端尚无本分支。这不代表提交在其他远端分支上完全不可达。
- 检查本地相对所有 remote refs 的待推送 Git 对象，没有超过 10 MiB 的新 blob。大型运行时资产不进入普通 Git 历史。
- 新增 `transfer-batch4-assets.mjs`，从实际低/高档 glTF URI 收集运行依赖，记录 207 文件 / 199,165,053 字节的 SHA-256 清单。实际导出后恢复到独立空目录，全部哈希相同；未在第二台实体设备验证。

### 换设备恢复

代码仓库本身**不包含森林运行资产**。需要同时携带独立的 `artifacts-local/pine-batch4/handoff/runtime/` 文件夹（或其压缩包）；这个文件夹未上传 GitHub，也没有云下载地址。范围包含低/高档和旧地面比较，不包含其他实验页的完整源资产。

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

`runtime-assets.json` 只记录资源与哈希，不包含用户档案。恢复脚本不访问浏览器存储。截图、性能、录屏和推送结果在后续阶段补充。
