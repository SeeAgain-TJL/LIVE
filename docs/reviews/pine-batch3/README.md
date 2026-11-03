# Pine Forest 第三批

起点：`bfe419b`，分支 `codex/pine-forest-vertical-slice`。本批只处理隔离森林的诊断、Blender 工作流、同源资源和运行时性能；不接入正式星球。

## P0：实测诊断检查点

2026-11-03，生产 Chrome / Intel Graphics ANGLE D3D11 / 1440×900 / DPR1。脚本 `scripts/forest-lab/verify-batch3-motion.mjs` 保留批二全部原有路径与时长，追加后退返回段；Chrome CDP CPU sampling 和上传拦截只在 `PINE_PROFILE=1` 启用，诊断数据不能当作无干扰验收。

原实现 profile：近景静止 35.34 FPS / P95 33.8ms / 7,338,065 triangles / 141 calls，没有实例 Buffer 上传；密集前行 33.61 FPS / P95 83.4ms / P99 100.2ms，9 帧 >100ms。14.76s 前行 CPU self sampling：`tick` 3382ms，`request` 1877ms，`performance.now` 702ms；逐实例资源请求/查找与同步筛选是已证实的移动 CPU 热点。上传调用 20,601 次、620,626,468 bytes，API 同步时间约 176ms；该时间不包含 GPU 异步执行，不能据此排除驱动/带宽成本。

静止 CPU 以 idle 为主但仅约 35 FPS，存在独立的几何/透明/GPU 限制。返回段约 32.56 FPS / P95 49.8ms，其中 `bufferData` CPU self 约178ms，资源首次激活/重新分配也需要处理。原路径释放20 tiles、10 LOD resources、777 batches：批二8秒空批释放使返回容易重新分配。无 Shader、页面或上下文错误，没有访问档案存储。

原始证据（仓库忽略的大文件）：`artifacts-local/pine-batch3/baseline-profile/`，每段 `.cpuprofile`、完整帧间隔、资源和截图位于 `results.json`。后续干净复测独立记录，不能混合结果。
