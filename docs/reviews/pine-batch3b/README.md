# Pine Forest 第三批 B · 视觉修复

起点 `adc258f`，分支 `codex/pine-forest-vertical-slice`。2026-11-03 开始，工作区干净。

本批进行中；不将计划写成验收通过。保留原 .blend、585 树、879825 地被、60 源分区及第三批性能架构；不接入正式星球或用户存储。

## 局部修复检查点

Blender4.4.3副本原生Python已读取真实main_terrain、pine_twig、fir_twig节点及原纹理。地形main_terrain使用Generated坐标与三组原贴图（forest_leaves_04 ×150、forest_ground_04 ×22、rocky_trail ×20），path/river属性控制材质混合。新派生沿原UV用Cycles烘焙4K底色、2K切线法线及1K粗糙度；不修改地形顶点、实例或源.blend。三图15,143,902 bytes，保留旧terrain.glb和验证1K地被。首次错误在完整场景同步树群，已停止并改为隔离地形场景；最终可复现脚本不执行全林渲染。

同机位完成原6,921,353 tris/142 calls/97树/79410地被对照，静止5秒42.97→41.69FPS/P95均33.6ms；此为局部静止检查，完整漫游另记。首次截图抓到未完成分区，被排除，v2等待额外稳定后几何/实例一致。

pine_04原材质Cycles同源16-view已实际烘焙（12 samples、512×1024/视角、原Filmic和world），3,515,020 bytes；仅代表一个树种，未处理其他10树种。相邻视角采用预乘RGB/alpha插值；低档用第三批PBR16-view以减少近中景材质差，高档可用原Cycles图集。仅减少22.5°硬切，不提供深度视差，固定烘焙光照依然存在。

局部近景试验：双pass、Alpha覆盖、恢复表面覆盖、float UV、35%几何。双pass及float UV无明显改善；35%达到2,326,661 tris（旧669,452）仍没有实质自然度收益，不推广；恢复表面覆盖只略增针叶且不等价透射，不进入默认。原完整PBR几何也较稀，不能把所有差异归因于LOD。原pine_twig Add Shader把未接Alpha的Translucent加到Principled，导出只保留Alpha PBR；自遮挡、透射和着色层次仍未恢复，近景问题未通过。

渐进连续性：585棵已加载的原tree-placement记录在地被分区尚未就绪时作为同坐标概览，分区驻留后跳过对应概览记录，保留当前95m/原LOD；无随机布局。驻留key快照与分帧选择一致。新旧LOD数量在新批次填充后统一发布，消除旧表示先清空造成的跨帧缺口；矩阵/性能回归待验。

## 已确认的转换差异

- 旧 `export-terrain.py` 只在整块地形 UV 上烘焙 2048² DIFFUSE/COLOR，运行时 `terrain.glb` 只有 baseColor，roughness 常数 0.95，没有 normal / AO。当前坡面细节密度不足；需检查原节点后决定派生恢复方式。
- 树枝叶目前为双面 glTF BLEND，运行时强制 single pass；近景为原模型 10% 同源简化。原 Cycles 透射/混合着色未等价。先以单树验证，不能凭经验批量扩大 Alpha。

## 执行中的验证

使用既有串行 Chrome 漫游脚本重新记录低档80%基线，原始数据在 `artifacts-local/pine-batch3b/baseline/`。Blender材质审计脚本只读取已验证副本，不保存 .blend。

结果、实际检查、图像、录屏、性能代价及未解决项将在各项完成后补录。
