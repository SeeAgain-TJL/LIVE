# V4.2 高品质场景样板（第一轮）

## 已实现

- 对个人海洋型星球建立派生的海岸样板：起伏地形、海岸线、PBR 地表、扫描树木/灌木/蕨类/岩石实例、HDR 天空、太阳光照和动态水面。
- 外部仍使用该 Planet 的实际 `appearance`；样板仅在进入内部时按 `ocean` 类型启用，其他类型继续使用原生命世界。
- 真实 `Memory.id` 仍映射成记忆球；0 条记录只显示环境。创建、媒体、编辑、详情关闭和返回流程沿用原数据层。
- 进入前预加载样板 GLB/HDR；场景 Suspense 只在真实资产仍未就绪时显示加载反馈，移除了额外的固定等待。

## 实际浏览器证据

`tests/browser/visual-slice.spec.ts` 会在隔离 Chrome 上保存真实截图和 WebM：

- `test-results/visual-slice-ocean-visual--*/01-exterior.png`
- `02-empty-coast.png`, `03-coast-second-view.png`
- `04-memory-in-world.png`, `05-open-memory.png`
- `video.webm`

最近一次高质量档位读数：约 41 FPS、p95 30.9 ms、4.16M triangles、44 textures、约 177 MB JS heap。当前仍偏重，低端设备需选择简化质量；这是一轮可运行样板，不是电影级最终资产验收。

## 已知限制

- 当前地形仍为运行时高度场，不是完整手工雕刻的生产地形；海岸样板已有真实 PBR/扫描资产，但仍需要美术精修、LOD 和远景裁剪。
- 浏览器控制台仍会报告一项页面资源 404，需要继续定位；核心场景、记忆读取和返回流程测试没有 page error。
- 录屏来自隔离 Playwright Chrome，不能替代用户本机不同 GPU 的性能验收。
