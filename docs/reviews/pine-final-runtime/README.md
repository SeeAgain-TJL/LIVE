# Pine Forest · 性能阶段

低、中档复用十一种旧有同源 LOD03 网格，近景继续有真实几何；远处和抬高视角使用原图集，距离包含高度差。远林范围不缩小。低档优先减少中远处投影很小的草/苔藓/地被，蕨类、幼树和主要岩石仍单独保留。中档扩大真实近景和微地被范围；高档用 Batch6 废墟、原 Batch2 近树和原高档细节。低/中废墟复用 Batch6 中间导出减至 225,864 三角形/3.32 MB（Batch6 约 132 万/25.85 MB），四处源坐标不动；近看会损失扫描细节。

地表、地标、共享高度场与初始清单并行预载；粗树和道具库在地表完成前准备，地表上传完成前不显示植被。低档首帧不等所有附近区块解码。源地被和树矩阵不删改；按相机更新分区与实例，原有迟滞、增量矩阵和批次释放仍启用。没有实现真正的 LOD 交叉淡化，切换仍可能看见。

生产构建首次低档实走（Chrome Intel 1440×900，内部 1152×720，42 秒输入）：59.59 FPS / P95 17.0 ms；首次就绪 6.15 秒、初始区块静止完全补齐 11.42 秒。四段均有位移；释放 18 分区和 6 个流送资源，无档案访问、页面错误或 WebGL 上下文丢失。这一轮不录像；最终三档对比另见集中验收。lint、typecheck 和生产构建通过。

恢复：先还原 [Batch6](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch6-landmarks-20261104) 与 [美术阶段](../pine-final-art/README.md)；再解压 [性能阶段增量](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-runtime-20261104)，用 transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-runtime/runtime-assets.json --from <解压目录>/runtime。原 Blender 及纹理来源不变。
