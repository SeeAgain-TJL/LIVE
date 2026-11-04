# Pine Forest · 整林集中验收

从 Batch6 `e5ffd6a` 接续；[整体美术](../pine-final-art/README.md)和[性能调整](../pine-final-runtime/README.md)分别提交、推送和发布。默认路线 `/forest-runtime-lab`；低、中、高分别默认 70%、80%、100% 内部像素，可手动切换。此次没有修改正式 Galaxy、Planet、Memory、档案或主分支。

[原场景与浏览器同机位](source-camera.webp)的左图是同一原 Blender 场景的既有 Cycles 2 样本截图（关闭合成、简化细分）；右图为本轮生产 Chrome 高档，起点位置、朝向与画幅匹配。浏览器补拍：[近景](near.webp)、[废墟中景](ruins.webp)、[抬高远景](far.webp)、[完整源地块俯瞰](panorama.webp)。俯瞰是验收相机，漫游录像不使用验收相机。

| 内容 | 恢复或保留 | 降级或缺失 |
| --- | --- | --- |
| 乔木 | 11 种源资产与 585 个源位置；高档近景使用现有较细网格，低/中复用源 LOD03 | 远处使用图集；有些角度的树冠较薄；没有复现 Cycles 叶片透射 |
| 地被 | 60 个源分区、879,825 条源散布记录；保留蕨类、松/冷杉幼树和石块 | 按可见性和档位选择；低档中远处草、苔藓和细碎覆盖减少；同机位林下层仍偏稀 |
| 地形 | 源地形、原三层 PBR 和 path/river 权重；增加最高约 0.237m 的源贴图起伏；导航覆盖原地形主体 | 原渲染级细分和微位移未逐面复现 |
| 河流 | 源曲面、按深度变化的色泽/透明、岸边过渡、HDR 波纹 | 不反射当前场景几何；未复现 Cycles 的折射、泡沫、流速场 |
| 废墟 | 四处源摆放、源材质和保守碰撞；高档保留 Batch6 细节 | 低/中减面与 1K 纹理；保守占地不保证拱下通行 |
| 天空与光影 | 复用源 HDR；太阳方向与 585 棵树近似投影的静态林冠遮光；林缘保留更多原树 | 不等价于逐叶实时投影或原体积雾；俯瞰仍看得到有限源地块的边界 |

恢复顺序：先从 [Batch6](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch6-landmarks-20261104) 下载基础包，再解压[整体美术增量](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-environment-20261104)和[性能增量](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-forest-runtime-20261104)。各自有独立的 runtime-assets.json；依序执行：

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-batch6/runtime-assets.json --from D:/pine/base/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-art/runtime-assets.json --from D:/pine/art/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-final-runtime/runtime-assets.json --from D:/pine/optimized/runtime
npm.cmd ci
npm.cmd run build
npm.cmd start
```

两份增量均从发布地址重新下载，核对 ZIP SHA-256，并逐文件校验（4 和 12 项）；Batch6 基础包沿用已逐项校验的 209 个文件。没有在第二台物理设备运行。可编辑源为 [Poly Haven 原 Blender 与纹理归档](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip)，原文件未改动。

## 真实输入与性能

Chrome 156 无头、Intel 核显 ANGLE D3D11、1440×900/DPR1，生产构建。每档新浏览器会话；相同的四段 W 输入与段间鼠标转向，角色不由脚本改坐标。以下 FPS 与 P95 为约 42 秒按键窗口的浏览器帧间隔，未录像、未开 GPU 计时；段间转向、等待和启动不混入统计。实际路径随帧率与碰撞略有差异，单机数据不能外推所有设备。

| 档位 | 实际渲染比例 | 平均 FPS | P95 帧间隔 | 首次就绪 / 首轮补齐 |
| --- | ---: | ---: | ---: | ---: |
| [低](walk-low.json) | 70%（1007×630） | **59.37** | **17.1 ms** | 5.57 / 10.49 秒 |
| [中](walk-mid.json) | 80%（1152×720） | 49.17 | 33.5 ms | 10.78 / 16.97 秒 |
| [高](walk-high.json) | 80%（1152×720） | 33.61 | 66.5 ms | 11.58 / 16.03 秒 |

最终低档本次路线达到 ≥30 FPS、P95≤40ms，四段位移均在 18 米以上。保留 [80% 低档未达标的对照](walk-low-80-comparison.json)（44.78 FPS / 49.8 ms）。首屏比 Batch6 的 12.61 秒快，附近资源仍会在之后补齐。切换延续已有图集回退和迟滞，未实现交叉淡化；局部地被和几何换档仍可能可见。三档试走无捕获页面错误、WebGL 上下文丢失或档案读写。

[废墟碰撞](ruin-collision.json)：避开树干的源废墟边界探测中，用真实 W 输入从 x=-49.75 走至 x=-46.508，停在 x=-46.50 边界前。该测试只验证一个代表边界，未遍历全部墙体或内部通道。

**模板判断：可以作为独立的可漫游环境候选交付视觉验收；暂不具备正式星球环境模板条件。** 针叶与林下密度、雾和反射未达到原场景水平；高档和边界过渡仍有取舍，低档达标结论限本机这条路线，移动端和第二台设备未验。

[真实漫游视频（WebM）](https://github.com/SeeAgain-TJL/LIVE/releases/download/pine-forest-review-20261104/pine-forest-walk.webm)：72.6 秒未剪辑，含启动、约 42 秒真实 W 输入、鼠标转向和停留；采集输出 1440×900 / 25fps，录制时浏览器低档 [实测](walk-recorded.json) 58.76 FPS / P95 17.1 ms。录像没有使用验收相机或相机事件。

[固定机位数据](stills-summary.json)：同一抬高远景，最终[低档](far-low.webp) 43.94 FPS / P95 34.0 ms、约 235 万三角形；高档 24.42 FPS / P95 50.5 ms、约 725 万三角形。前者是 70%、后者 80%，用于说明实际档位取舍。Batch6 低档远景曾在带 GPU 诊断的不同采样条件下约 22.86 FPS / 845 万三角形，不能直接用 FPS 比值衡量单项优化。高档全景同一帧流送报告列出全部 585 棵源树。

验收检查：lint、typecheck、46 项单测、生产构建和 2 项 travel-comfort 浏览器回归通过；另完成整林四机位、三档真输入、源废墟边界与独立录像。未运行其余正式浏览器回归或真机移动端。此轮停止在隔离候选，由用户做视觉验收。
