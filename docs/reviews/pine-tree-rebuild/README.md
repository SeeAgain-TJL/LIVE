# Pine Forest · 11 个源树型

从 [pine_02 代表树](../pine-tree-representative/README.md) 的方法接续。全森林沿用原始 585 个树木世界矩阵、11 个树型和现有分区；河床、废墟、岩石、地形、碰撞及记忆系统沿用原版本。两个完整森林审阅入口是 `/forest-runtime-lab` 和 `/forest-memory-lab`；前者加 `?trees=legacy` 可看原树资产。

近档使用按源针叶位置和方向制作的有色几何；中远档的透明遮罩按枝梢烘焙，固定在树的局部空间，仍有真实木质骨架，不朝相机转动。银冷杉源节点会在枝梢实例化后覆盖材质，制作脚本将覆盖目标改为重建枝梢材质。首轮整林检查还发现，整片木质几何统一强力减面会在细银冷杉枝条上生成明显三角面。中远档改为在源曲线上降低环数再形成枝条，扫描树基单独减面，远档不绘制细枯枝。原来的枝梢散布和树木位置保持不变。

来源：[Poly Haven Pine Forest 官方源包](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip)（[CC0](https://polyhaven.com/license)）。使用 Blender 4.4.3 和 [meshoptimizer gltfpack 1.3](https://github.com/zeux/meshoptimizer/tree/v1.3)。原始 Blender 和贴图保留，派生包中的 Blender 库包含独立可编辑树型及内嵌纹理。

## 恢复

先恢复[上一版完整运行资源](../pine-scene-repair/README.md)，再下载[重建树木 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-tree-rebuild-20261105)。解压运行包后，在仓库根目录执行：

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-tree-rebuild/runtime-assets.json --from C:/path/to/extracted/runtime --to public/forest-origin-assets
```

恢复命令校验大小和 SHA-256，并拒绝覆盖已有但不同的资源。制作包可独立解压，打开 `authoring/pine-rebuilt-trees.blend`；重新制作还需要官方源包。运行包只含新增树木，不包含存档、记忆或媒体。
