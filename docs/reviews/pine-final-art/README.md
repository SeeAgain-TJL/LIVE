# Pine Forest · 整体美术阶段

以 Batch6 e5ffd6a 为基线，默认整林保留原摆放和现有三层 PBR。用未修改的 Blender 4.4.3 原工程求值地形，按原 path/river 权重施加最多 0.237m 地表细节；导航与水岸使用同一地形。0.5m 导航格覆盖原地形主体，四个废墟原网格生成保守占地，阻挡顶部投影下方通行。针叶/地被仍使用原派生网格和图集；延长蕨类、幼树及树冠可见范围。原 585 棵树的冠幅和源太阳方向用于烘焙软光照场，统一地面、枝干、林下层与废墟色调。水面保留 Batch6 原曲面，增加床面深度驱动的透明、色泽及 HDR 波纹反射。现有 HDR 与距离雾调至较暗色阶。没有重做三层 PBR、散布或模型。

[阶段起点实拍](near.webp)；Chrome 低档近、中、远固定机位通过出图，无捕获错误。lint、typecheck、46 单测通过。此阶段未承诺性能达标；叶片透射、真实反射、体积雾与精确阴影仍为实时近似，废墟拱下空间不保证可走。可见森林只使用原场景布局，源边界之外未虚构延伸。

在 [Batch6 运行包](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch6-landmarks-20261104) 的基础上下载 [阶段增量](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-environment-20261104)，解压并用 transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-art/runtime-assets.json --from <解压目录>/runtime 恢复。可编辑源和纹理由 Poly Haven 原归档恢复；build-pine-environment.py 可从原 blend 重新派生，原文件 SHA-256 未变。
