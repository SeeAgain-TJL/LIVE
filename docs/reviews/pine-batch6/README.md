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

## 生产构建补测与发布

[起点源相机对照](source-comparison.webp)复用原工程归档的 Cycles 2 样本渲染（关闭合成、简化细分），与本轮实际 WebGL 画面并排；岩石、水道和废墟的构图位置可核对。水面色泽、林下密度和背光差距明显。中远景没有新增 Blender 对照。

[生产 GPU 采样](production-gpu.json)：Chrome Headless 的 WebGL ANGLE Intel Graphics / D3D11，低/高档均为 1152×720 内部像素。启用 WebGL GPU 查询及 CPU 采样，有诊断开销；近/中/远为固定机位，其中中景机位与上表废墟机位不同。

| 生产固定机位 | 低档平均 FPS / 帧 P95 / GPU P95 | 高档平均 FPS / 帧 P95 / GPU P95 |
| --- | ---: | ---: |
| 近景 | 26.48 / 66.7 ms / 42.84 ms | 22.42 / 84.5 ms / 59.46 ms |
| 中景 | 41.74 / 50.0 ms / 27.92 ms | 30.39 / 50.4 ms / 39.11 ms |
| 远景 | 22.86 / 67.8 ms / 53.25 ms | 16.03 / 116.8 ms / 73.65 ms |

六组均无 disjoint 或捕获的页面错误。另有不启用 GPU 查询的[高档静止测量](production-high-stills.json)。GPU 和帧时间结果均不能视为整林性能通过。

运行 ZIP 197,475,711 字节，发布目标提交 `5d8cbf7`；GitHub 的 SHA-256 与本地一致。已从发布 URL 下载、重新核对 ZIP 并解压验证全部 209 项，见[附件回执](remote-assets.json)。

[连续键鼠试走](production-walk.json)：低档生产构建新浏览器会话首次就绪 12.61 秒、首轮流送稳定 14.10 秒。42 秒 W/D/S 输入配合真实鼠标拖动，第一段由起点位移约 48.5 米，最后一段几乎原地，不能视为无阻通行。各段平均 26.74/29.00/37.35 FPS，P95 68.1/66.6/50.0 ms。试走结束累计释放 10 分区、6 流送资源、383 批次及 5 材质，无捕获的浏览器错误或 WebGL context loss。这里的释放计数来自运行时，未测实际 GPU 显存；废墟没有专用碰撞。
