# Pine Forest 游戏级枝叶卡片代表区域（38 棵树）

结论：候选不推广。`?trees=game-region` 保留为可选入口，默认森林不变。

## 范围
区域圆心 (4, -44)、半径 33 m，38 棵原树位置由 EZ-Tree（MIT，dcf309b）的 Pine 预设枝叶卡片替换，经 Blender 导出 `trees.glb`（4.9 MB，8 组实例）。其余地形、河床碎石、倒木、废墟、雾、记忆系统均沿用原森林。

## 接入缺陷与修复
首版把 GLB 加载完成状态作为 `PineStream` effect 的依赖，加载后流式系统被销毁重建，共用纹理被释放，候选画面丢失河床碎石、倒木、雾和深色落叶地表，draw calls 由 141 降到 31。上一轮“近景 49.8→59.5 FPS”主要来自内容缺失，作废。修复（a27a065）改为由 URL 参数决定排除区域，流式系统只创建一次。修复后近景 draw calls 135、纹理 74，周边内容恢复。

## 修复后实测（Intel 核显，Chrome，生产构建，低档，80% 分辨率，每机位静止 7 秒）
| 机位 | 旧森林 FPS / P95 | 候选 FPS / P95 |
|---|---|---|
| 近景 | 49.8 / 33.4 ms | 44.7 / 33.5 ms |
| 远景 | 56.8 / 33.1 ms | 44.4 / 33.5 ms |
| 树冠 | 60.1 / 16.9 ms | 60.1 / 16.9 ms |
| 中景步行位 | 54.3 / 33.4 ms | 57.3 / 17.4 ms |
| 远景步行位 | 54.5 / 33.4 ms | 59.3 / 17.0 ms |

单次静止采样，波动大，不是连续漫游，也不是 GPU timer query。没有显示出一致的性能收益。原始数据：[baseline-results.json](baseline-results.json)、[candidate-fixed-results.json](candidate-fixed-results.json)。

## 视觉评价（左旧森林，右候选）
[近景](ab-near.jpg) · [远景](ab-far.jpg) · [中景步行位](ab-walkMid.jpg) · [树冠（未修复版，仅看树冠）](ab-crown-unfixed.jpg)
- 树冠饱满度：卡片密度足够，但亮绿、饱和，近看像剪纸，与原森林暗绿写实风格不一致。
- Alpha 透明：阈值 0.3 工作正常，无黑边或方框。
- 立体感：枝条为规则放射状直锥，树干光滑浅棕，缺少原树皮纹理和针叶团块的体积。
- 转动视角：同一位置按 0/60/120/180 度各拍一张（[yaw-grid.jpg](yaw-grid.jpg)）。卡片侧对镜头时退化成细长窄片（右下格），并且出现了树叶团块边缘清晰的剪影，确认存在纸片感。仅为 4 个静止朝向，不是逐帧检查。
- 未做：连续漫游录屏、Blender 同机位对照。

## 复原
Release `pine-game-region-20261105`（runtime / authoring 两个 ZIP，哈希见 remote-assets.json）。运行包解压到仓库根目录，访问 `/forest-runtime-lab?trees=game-region`。重新生成树木：`scripts/forest-lab/generate-game-trees.mjs` 与 `build-game-tree-region.py`。

## 后续（如继续该路线）
更换为写实针叶卡片或用原 Pine Forest 针叶贴图重烘焙；调色与雾对齐旧森林后再比较。不建议在当前资产上继续调参。