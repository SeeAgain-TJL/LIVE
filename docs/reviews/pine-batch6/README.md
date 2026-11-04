# Pine Forest Batch6 · 源河道与废墟

接续点：本地与远端均为 Batch5 的 `e3cef0f`，工作区干净。沿用 60 个源分区（585 棵树、879,825 条地被记录）；该数字是源覆盖范围，不是每帧绘制量。默认整林入口 `/forest-runtime-lab?scale=0.8`，河床样板仍通过 `sample=creek` 打开。

原始 Blender 核对：河水为 172.6 × 190.55 米 Geometry Nodes 曲面，求值后 241,664 面。三种废墟模型有四处可渲染摆放（含 `montaigle_ruins_01.001`）。导出保留四处世界矩阵、源 UV 和漫反射/粗糙度/法线贴图。河水保留曲面，以半透明 PBR 近似原材质；无原始流动、折射或泡沫。glTF 使用 Blender 4.4.3 和 gltfpack 1.3，运行包内 GLB 25,848,752 字节，五处绘制实例合计约 132 万三角形。整林主光采用原太阳方向与调整过的暖色。保留现有 HDR、距离雾、地形和植被 LOD；距离雾尚未复刻原体积雾。源地形约 203×200 米，path/river/terrain 三个节点修改器启用，Subdivision 视口 0、渲染 2；本阶段未将渲染细分和材质位移转换到整林。

| Chrome 低档静止（开发服务，1440×900，80% 内部像素） | 画面 | 平均 FPS | P95 帧时间 |
| --- | --- | ---: | ---: |
| 起点近景 | [截图](near.webp) | 30.82 | 50.0 ms |
| 废墟方向 | [截图](ruins.webp) | 43.13 | 33.4 ms |
| 抬高远景 | [截图](far.webp) | 25.57 | 50.2 ms |

三处均等地表、地标及当前流送队列就绪后采样约 7 秒，无捕获的浏览器错误。帧时间为浏览器帧间隔，未测 GPU 查询时间。近景和远景未达 P95≤40ms。lint、typecheck、46 个单测、生产构建通过。现有地形与树干碰撞保留并可沿边缘滑动；废墟碰撞、完整路线输入、GPU 计时、资源释放专项和 Blender 同机位对照仍未验收。

恢复：解压 [Batch6 GitHub 预发布](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch6-landmarks-20261104) 的运行 ZIP 得到 runtime/。ZIP 已本地解压并核对全部 209 个文件；另一个物理设备未测。Batch5 局部样板仍从其原 Release 恢复。原始可编辑工程与纹理继续由 [Poly Haven 官方原始归档](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip) 提供，原 blend 的 SHA-256 与之前记录一致。此次无新保存的 Blender 工程。

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-batch6/runtime-assets.json --from D:/pine-batch6/runtime
npm.cmd ci
npm.cmd run build
npm.cmd start
```

重新导出地标：用 Blender 后台打开原 blend，执行 `--python-exit-code 1 --python scripts/forest-lab/export-batch6-landmarks.py -- OUTPUT_DIR`；再用 gltfpack `-i RAW/landmarks.glb -o RUNTIME/batch6/landmarks.glb -c -tw -tl 2048 -kn -si 0.15 -se 0.004 -slb`。原 blend 不保存修改。
