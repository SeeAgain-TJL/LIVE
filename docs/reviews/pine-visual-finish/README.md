# Pine Forest · 集中视觉验收

**与 `3f422c5` 相比，整体视觉有明显提升，可以作为独立可漫游候选交付。暂不建议接入正式星球。** 提升主要来自有空间分布的暗绿林下、较连贯的中景树冠和林缘补景。最贴近镜头的针叶、俯瞰源地块接缝和高档帧时间仍需解决。本轮到此停止，等待视觉验收。

[Blender 原机位 / 上一轮 / 本轮](source-camera.webp) · [近景](near.webp) · [废墟中景](ruins.webp) · [抬高远景](far.webp) · [全林俯瞰](panorama.webp)。原图为同一 Blender 场景此前存档的 Cycles 2 样本输出（关闭合成、简化细分）；两张浏览器图均用同一位置、方向、纵向视角及高档 80% 内部分辨率。全林俯瞰显示全部 585 棵源树，外侧补景不计入该数量。[四机位实测](stills.json)记录相机、绘制和流送状态。

[真实自由漫游 WebM（67.32 秒）](https://github.com/SeeAgain-TJL/LIVE/releases/download/pine-visual-review-20261104/pine-visual-finish-walk.webm)：低档，Chrome 录制 1440×900 / 25fps，未剪辑。包含加载、四段约 42 秒真实 W 输入和鼠标转向，随后用 A、S、D 各移动 4.20、3.30、2.54 米。全程使用默认整林路由和现有漫游控制，没有镜头瞬移。录制时 42 秒窗口的浏览器帧率是 58.34 FPS / P95 17.5ms；视频帧率是编码帧率。[录像采样](walk-low-recorded.json)

| 内容 | 本轮完成 | 仍有差距 |
| --- | --- | --- |
| 树冠 | 8 种树的图集增加源角度背层；中近景保留现有几何，并在合适距离加无树干的半透明冠层。 | 近处裸枝、逐针叶透光与相邻角度切换仍可见；最贴近镜头处使用原有网格。 |
| 林下 | 将原分区里的苔藓、蕨类/草/幼树、松针与碎枝分别烘成覆盖场；低、中档保留更多可见蕨类和幼树，路径和河岸仍可辨。 | 地表混色替代了部分真实小植被，不能产生全部高度、遮挡和细碎视差。 |
| 林缘 | 源地块之外加入连地的分段基底和 951 个以源树轮廓制作的补景树；远处不再直接切到天空。 | 补景不可行走；高俯瞰仍能看到原 PBR 地块与延伸地表的形状及纹理接缝。 |
| 河道、废墟、环境 | 复用源曲面、岸深、废墟位置/碰撞和 HDR；压低水面泛白与环境补光，保留暖亮岸边和暗绿林下。 | 没有当前场景几何反射、Cycles 透射或体积雾；逆光仍可能显出亮天空和较浅的水面。 |

## 连续探索性能

生产构建，Chrome 156 无头模式，Intel 核显 ANGLE D3D11，1440×900/DPR1。每档新会话，相同四段 W 与段间鼠标输入。FPS、P95 只统计约 42 秒按键窗口；启动与资源补齐分别记录。因为碰撞和帧间隔不同，路径会有小幅偏差。每种配置一次样本。

| 档位 | 内部分辨率 | 平均 FPS | P95 帧间隔 | 首次就绪 / 首轮补齐 | 判断 |
| --- | --- | ---: | ---: | ---: | --- |
| [低（默认）](walk-low.json) | 70%，1007×630 | **56.42** | **32.7ms** | 5.88 / 9.00s | 达到 ≥30 FPS、P95 ≤40ms |
| [中（默认）](walk-mid.json) | 80%，1152×720 | **59.89** | **17.1ms** | 5.45 / 5.62s | 本次路线流畅；单次结果不代表比低档更快 |
| [高（对照）](walk-high.json) | 80%，1152×720 | 32.17 | 50.5ms | 11.36 / 15.16s | 长帧明显，适合看画面 |
| [高（默认）](walk-high-native.json) | 100%，1440×900 | 23.63 | 66.8ms | 7.99 / 10.16s | 本机不适合持续漫游 | |

三档运行无页面、网络资源错误或 WebGL 上下文丢失，未读取或写入档案；持续漫游有分区、网格批次及材质释放记录。低档这次平均略低于上一轮 59.37 FPS / P95 17.1ms，但仍满足目标。固定远景低档 [48.05 FPS / 33.5ms](far-low.json)，约 235 万三角形。 保留既有流送迟滞，没有加入交叉淡化，转向时仍可能看到局部植被档位切换。补景资产只影响画面，原地块碰撞使用原来的导航数据；[废墟边界测试](ruin-collision.json)用真实 W 输入验证了一个代表边界。

## 在另一台设备恢复

先按[上轮三包恢复顺序](../pine-final/README.md)恢复 Batch6 基础、整林环境和性能增量，再从 [集中美术 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-visual-finish-20261104)下载并解压 `pine-visual-finish-runtime.zip`，叠加新目录：

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-visual-finish-art/runtime-assets.json --from D:/pine/visual/runtime
npm.cmd ci
npm.cmd run build
npm.cmd start
```

打开 `/forest-runtime-lab`。增量 ZIP 重新从 GitHub 下载验证 SHA-256，解包后 14 个文件逐项验证，见[发布回执](../pine-visual-finish-art/remote-assets.json)。原始 Blender、纹理和已有运行包沿用上轮位置。没有第二台设备或真机移动端性能数据。正式 Galaxy、Planet、Memory 没有改动，未合并 `main`。

检查：lint、typecheck、46 项单测、生产构建、2 项正式 `travel-comfort` 浏览器回归、四机位、三档连续漫游和单独录屏。未运行其余正式浏览器回归。
