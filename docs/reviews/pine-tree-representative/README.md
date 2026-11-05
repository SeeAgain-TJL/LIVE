# Pine Forest · 代表松树制作验证

从 `23e0923` 干净分支开始。只在完整森林审阅入口加 `?trees=rebuild` 时启用 `pine_02`，默认仍为原森林。Poly Haven 原树的 Geometry Nodes 实际生成 1,090 个末端枝梢；三档均保留这组源实例的位置和朝向，以及原树在森林中的全部 52 个世界变换。

第一版枝梢投影消除了全树纸片的视角问题，但近看针叶变成粗块，未采用。定版近景从原枝梢中选出空间分布均匀的针叶网格岛，按局部主轴重建有长度、朝向和源色的针叶几何，木质网格单独减面。中、远景从同一重建枝梢烘焙透明覆盖，将不同方向的枝梢面固定在源空间，保留各自的真实木质骨架，不朝相机旋转。三档分别 289,046 / 11,022 / 6,054 个三角形。进入相邻档位使用互补像素覆盖和异步就绪权重，不再叠加整树图集。

下面每图从左至右：原 Blender（隔离该树，原天空与灯光）／旧生产 Chrome／新生产 Chrome。三者共用原树世界矩阵、镜头方向、48.5° 垂直视场；浏览器同为低档 70%。左列不是完整森林渲染。

- [近景](pine02Near.webp)
- [中景](pine02Mid.webp)
- [远景](pine02Far.webp)

Intel 核显生产 Chrome 单机位 7 秒采样：新近/中/远 60.14 / 58.88 / 56.98 FPS，P95 为 16.9 / 17.0 / 32.7ms。[原始帧间隔摘要与实际绘制档位](verification.json)。新树仍有亚像素针叶颗粒，缺少 Cycles 原透射；源松树本身也有开放冠层，保留枯枝和透空。通过代表树制作门槛，整林负载与自然度仍须在批量接入后验证。

来源：[Poly Haven Pine Forest 官方源包](https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip)，[CC0 许可](https://polyhaven.com/license)。使用 Blender 4.4.3 生成和导出、[meshoptimizer gltfpack 1.3](https://github.com/zeux/meshoptimizer/tree/v1.3) 压缩，压缩阶段不做二次减面。

[代表树开发 Release](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-tree-representative-20261105) 提供三个 GLB 的运行包和独立 Blender 制作包。恢复时用 [SHA-256 清单](runtime-assets.json) 和 `scripts/forest-lab/transfer-batch4-assets.mjs restore`，传入解压目录的 `runtime/`；同时需要上一版[完整场景资源](../pine-scene-repair/README.md)。
