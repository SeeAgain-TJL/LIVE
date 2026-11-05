# Pine Forest · 11 个源树型

从 [pine_02 代表树](../pine-tree-representative/README.md) 的方法接续。全森林沿用原始 585 个树木世界矩阵、11 个树型和现有分区；河床、废墟、岩石、地形、碰撞及记忆系统沿用原版本。完整重建的审阅入口为 `/forest-runtime-lab?trees=rebuild`（森林）和 `/forest-memory-lab?trees=rebuild`（森林与记忆）。由于低档帧间隔未过门槛，省略查询参数时保留上一版的默认森林。

近档使用按源针叶位置和方向制作的有色几何；中远档的透明遮罩按枝梢烘焙，固定在树的局部空间，仍有真实木质骨架，不朝相机转动。银冷杉源节点会在枝梢实例化后覆盖材质，制作脚本将覆盖目标改为重建枝梢材质。首轮整林检查还发现，整片木质几何统一强力减面会在细银冷杉枝条上生成明显三角面。中远档改为在源曲线上降低环数再形成枝条，扫描树基单独减面，远档不绘制细枯枝。原来的枝梢散布和树木位置保持不变。

来源：[Poly Haven Pine Forest 官方源包](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip)（[CC0](https://polyhaven.com/license)）。使用 Blender 4.4.3 和 [meshoptimizer gltfpack 1.3](https://github.com/zeux/meshoptimizer/tree/v1.3)。原始 Blender 和贴图保留，派生包中的 Blender 库包含独立可编辑树型及内嵌纹理。

## 画面与体验

- 原 Blender／旧生产浏览器／重建生产浏览器同机位：[完整森林](source-camera.webp) · [代表树近景](pine02Near.webp) · [中景](pine02Mid.webp) · [远景](pine02Far.webp)。森林的 Blender 画面是已有的 Cycles 存档；三个单树画面是本轮使用原树、原天空及灯光拍摄的隔离 Eevee 对照。浏览器画面同为低档 70%，垂直视场 48.5°。
- 完整森林实际截图：[河岸近景](near.webp) · [林坡中景](walkMid.webp) · [远景](far.webp) · [河道](river.webp) · [林缘抬高](raisedEdge.webp) · [585 棵俯瞰](panorama.webp)。
- [连续键鼠漫游和记忆交互](../pine-tree-rebuild-review/README.md) · [记忆阅读画面](memory-photo.webp)。

近处能分辨针叶和前后枝层，中远处视点变化不再旋转整棵树。首批银冷杉的三角破面已修复。远处细枝的遮罩仍会失去覆盖，部分树冠和俯瞰偏薄；透射和阴影也有原作差距。整林候选可审阅，尚未达到正式星球模板标准。

## 性能与回归

Intel Graphics 0xA7AA、D3D11、生产 Chrome、1440×900。分开测量各档，从出生点沿同一可走干岸到记忆附近，再后退回出生点附近。每次验证两段的端点和位移，测帧时不录视频。固定时间输入的早期采样中部分档位在障碍前空跑，未用于下表。

| 重建档位 | 内部分辨率 | 平均 FPS | P95 帧间隔 | 首次可见 / 初始资源补齐 |
| --- | ---: | ---: | ---: | ---: |
| 低 | 70% | 40.1 | 50.0 ms | 6.0 / 9.0 s |
| 中 | 80% | 27.5 | 66.7 ms | 6.8 / 9.7 s |
| 高 | 100% | 19.4 | 100.4 ms | 6.0 / 9.8 s |

旧版低档在同一路线为 52.6 FPS、P95 33.4ms。重建版低档超过 30 FPS，但未通过 P95 ≤40ms；中档勉强可走，高档在该核显上不推荐。[原始性能摘要与低档 A/B](performance.json)。分辨率、雾效、树林数量保持不变。生产浏览器检查了三档切换、GPU 释放、原碰撞边界、实际移动和记忆交互。

复测时将 `FOREST_LAB_URL` 指向 production 服务，设置 `PINE_ROUTE=memory-bank`、`PINE_VISUAL_FINISH=1`、`PINE_QUERY=trees=rebuild`，按档位设 `PINE_QUALITY` 与 `PINE_SCALE` 后运行 `node scripts/forest-lab/verify-batch6-walk.mjs`。旧版对照使用 `PINE_QUERY=trees=legacy`。

## 恢复

先恢复[上一版完整运行资源](../pine-scene-repair/README.md)，再下载[重建树木 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-tree-rebuild-20261105)。解压运行包后，在仓库根目录执行：

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-tree-rebuild/runtime-assets.json --from C:/path/to/extracted/runtime --to public/forest-origin-assets
```

恢复命令校验大小和 SHA-256，并拒绝覆盖已有但不同的资源。若之前恢复过仅含 `pine_02` 的代表树增量，请在另一份检出目录恢复，或先单独备份旧的 `tree-rebuild` 文件夹。制作包可独立解压，打开 `authoring/pine-rebuilt-trees.blend`。这是 Blender 场景库，打开后从场景下拉选择树型，或用「追加 → Scene」导入其他项目。重新制作还需要官方源包，原始 Blend 的 SHA-256 为 `fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb`。运行包只含新增树木，不包含存档、记忆或媒体。

已从 Release 重新下载两个包并校验 SHA-256，将 33 个新增 GLB 加入隔离运行目录（共 284 个清单项），使用该目录完成浏览器验收；也重新打开制作包，核对 11 个树型和实际使用的 17 张内嵌纹理。见[恢复记录](restoration.json)。这是同机隔离恢复，未在第二台物理设备上重测。
