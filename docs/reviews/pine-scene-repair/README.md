# Pine Forest 场景错误修复

从远端与本地一致、工作区干净的 cf914238 继续。原工程、旧运行包和正式数据保留。

## 已验证的资源修复

低/中档废墟的 UV 接缝被旧优化过程破坏，产生大片三角形纹理拉伸。同机位高精 GLB 正常；原 Blender 模型、未优化 GLB 的 UV 范围均正常，不是贴图缺失或运行时光照导致。Blender 从既有正确源 GLB 制作新版本，按 UV、法线、材质和 seam 边界执行保守平面简化，压缩阶段不再执行二次减面。保留三种废墟、四处原世界矩阵；新运行 GLB 29,394,760 字节。低档真实浏览器替换验证墙面拉花消失，约 48.94 FPS/P95 33.6ms（1440×900、80%内部像素、静止7秒），比错误低模更重，正确性优先。

河水保留源布局，恢复既有源导出中的36,248个三角形，取消后续5,436/4,349面二次简化；没有重建河流或搬动石块。

新增独立记忆安全场：从原 Blender 241,664面水曲面逐格求交，避开水面、原导航阻挡与1,245个源岩石/枯木实例的保守占地，并检验起点连通性和1m站立区域。共92,781个安全采样点；只是环境派生数据，不修改Memory/Planet结构或用户档案。

制作脚本与原始审计记录在本目录和 scripts/forest-lab。新 `.blend` 是由源 GLB 导入后产生的独立制作资产，原始 Pine Forest `.blend` 未修改。运行和制作ZIP通过独立 GitHub Release 交接。

树木审计：源 pine_02 约396万针叶三角形，现有高近景保留约39.6万、低近景约11.9万；源 Add Shader 中的透射分支没有等价导出为 glTF Alpha。整树图集本身缺少视差。仅对 pine_02 测了 Blender 原材质固定空间切片烘焙：增加了遮挡面积，但近景暴露分离的平面条片，中景轮廓断开。撤下试验接线，交付版树资产和 LOD 保持现状。

## 场景接线

完整森林两入口、三档画质共用修正后的地标几何，保留原河流着色。流送分区在生成包围盒和实例矩阵前，校正 41,884 个源石块的垂直位置（−8.0 至 +20.9cm）；原始分区、XY、旋转、缩放都保留。校正值来自原 Blender 评估地面与现有导航浮雕的高度差。

`/forest-memory-lab` 只在安全场的四个采样角均可用时才生成锚点；安全场在完整森林记忆入口加载，样板和普通运行入口不加载它。生产 Chrome 已从真实出生点连续键鼠走到约 75m 外的干岸记忆，打开正文/照片/视频，Escape 关闭、切换画质、退出，档案内容前后一致。录屏使用隔离测试档案。

验证：lint、typecheck、52 项单元测试、生产构建、森林记忆和两项旅行浏览器回归通过。记忆录屏从生产 Chrome 捕获，约 54 秒。约 00:18 可见废墟与河床，00:28 沿水转向，00:38 到达记忆，之后进入阅读。路线不使用审阅机位或瞬移。

## 浏览器画面

| 机位 | `cf914238` | 修复后 |
| --- | --- | --- |
| 低档废墟墙面 | [修复前](ruins-before.webp) | [修复后](ruins-after.webp) |
| 低档河床与废墟 | [修复前](creek-before.webp) | [修复后](creek-after.webp) |
| 代表树种近景 | [现有树冠](pine02-current.webp) | [试验截图，未采用](pine02-rejected.webp) |

[河道近景](river-after.webp) · [森林远景](forest-after.webp) · [记忆阅读](memory-photo.webp) · [连续漫游录屏](https://github.com/SeeAgain-TJL/LIVE/releases/download/pine-scene-repair-review-20261105/pine-scene-repair-walk.webm)。前两行是同机位、同视角、1440×900 窗口和 80% 内部分辨率；树木一行是未接入候选的诊断对比。原 Blender 构图参考可见[历史同机位图](../pine-template-final/source-camera.webp)，其中的浏览器画面属于旧检查点。

## 运行性能

Chrome 156 / ANGLE D3D11 / Intel Graphics (0x0000A7AA)，1440×900，DPR 1。沿用[前一轮 42 秒路线](../pine-template-final/README.md)的出生点、按键时长和鼠标转角，各档单独运行，无录屏开销。路线中的碰撞和帧间移动会改变实际位置；对照是同机历史测量，非同步测试。

| 画质 / 内部比例 | 平均 FPS | P95 帧间隔 | 地形、地标和初始森林就绪 / 流送队列清空 |
| --- | ---: | ---: | ---: |
| 低 / 70% | 58.44 | 17.2ms | 6.76s / 9.41s |
| 中 / 80% | 54.99 | 33.3ms | 6.37s / 9.26s |
| 高 / 100% | 31.32 | 50.0ms | 7.56s / 10.15s |

低档达到 ≥30 FPS / ≤40ms，中档可用，高档在本机仍有可感知的卡顿，不作为核显默认。修复包的几何比错误低模重：河床同机位 80% 静止采样也出现退化，加载就绪/清空相较历史同路线变慢。详见[运行证据](verification.json)。保持原有三档与自动低档，没有通过降低分辨率掩盖损坏几何。

## 恢复方式

先按[基础森林恢复说明](../pine-template-final/README.md)恢复 246 个文件。再下载[地标修复 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-scene-repair-20261105)的 `pine-scene-repair-runtime.zip`，及[石块落地 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-scene-repair-contact-20261105)的 `pine-scene-repair-contact-runtime.zip`，分别解压到独立目录。以下命令从各 ZIP 的 `runtime/` 复制到 `public/forest-origin-assets/`，逐项核验 SHA-256，拒绝覆盖内容不同的旧文件。

```powershell
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-scene-repair/runtime-assets.json --from <地标ZIP解压目录>/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-scene-repair-contact/runtime-assets.json --from <石块ZIP解压目录>/runtime
npm.cmd ci
npm.cmd run build
npm.cmd start
```

入口为 `/forest-runtime-lab` 和 `/forest-memory-lab`。两个运行 ZIP 和制作 ZIP 已从 GitHub 重新下载、核对 SHA-256。生产 Chrome 仅从独立恢复目录提供 251 项清单中的森林资源，完成默认低档启动、低→中→高→低切档，观测到流送缓冲和纹理释放，边界阻挡正常。另测废墟墙面，实按 W 停在墙前。制作 ZIP 内的独立 `landmarks-repaired.blend` 已用 Blender 4.4.3 重新打开，确认四处废墟及其 UV、河水对象均在。原始完整场景和纹理仍沿用基础说明。本轮恢复验证在同机独立目录完成，没有将用户档案或媒体加入资源包。

废墟、河水、石块接触和记忆锚点可交付体验。现有近景针叶仍稀，中远景换视角仍可辨认图集；未通过正式模板的整体自然度验收。真正缺少的是能保留针叶光学覆盖和视差、又可在低档预算内使用的代表性松枝资产。保留试验记录，不继续推广切片方案。
