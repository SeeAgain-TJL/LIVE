# Pine Forest 第三批 B · 视觉修复

起点 `adc258f`，分支 `codex/pine-forest-vertical-slice`。2026-11-03 开始，工作区干净。

本批进行中；不将计划写成验收通过。保留原 .blend、585 树、879825 地被、60 源分区及第三批性能架构；不接入正式星球或用户存储。

## 已确认的转换差异

- 旧 `export-terrain.py` 只在整块地形 UV 上烘焙 2048² DIFFUSE/COLOR，运行时 `terrain.glb` 只有 baseColor，roughness 常数 0.95，没有 normal / AO。当前坡面细节密度不足；需检查原节点后决定派生恢复方式。
- 树枝叶目前为双面 glTF BLEND，运行时强制 single pass；近景为原模型 10% 同源简化。原 Cycles 透射/混合着色未等价。先以单树验证，不能凭经验批量扩大 Alpha。

## 执行中的验证

使用既有串行 Chrome 漫游脚本重新记录低档80%基线，原始数据在 `artifacts-local/pine-batch3b/baseline/`。Blender材质审计脚本只读取已验证副本，不保存 .blend。

结果、实际检查、图像、录屏、性能代价及未解决项将在各项完成后补录。
