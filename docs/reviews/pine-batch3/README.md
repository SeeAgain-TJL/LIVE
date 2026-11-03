# Pine Forest 第三批

起点：`bfe419b`，分支 `codex/pine-forest-vertical-slice`。本批只处理隔离森林的诊断、Blender 工作流、同源资源和运行时性能；不接入正式星球。

## P0：实测诊断检查点

2026-11-03，生产 Chrome / Intel Graphics ANGLE D3D11 / 1440×900 / DPR1。脚本 `scripts/forest-lab/verify-batch3-motion.mjs` 保留批二全部原有路径与时长，追加后退返回段；Chrome CDP CPU sampling 和上传拦截只在 `PINE_PROFILE=1` 启用，诊断数据不能当作无干扰验收。

原实现 profile：近景静止 35.34 FPS / P95 33.8ms / 7,338,065 triangles / 141 calls，没有实例 Buffer 上传；密集前行 33.61 FPS / P95 83.4ms / P99 100.2ms，9 帧 >100ms。14.76s 前行 CPU self sampling：`tick` 3382ms，`request` 1877ms，`performance.now` 702ms；逐实例资源请求/查找与同步筛选是已证实的移动 CPU 热点。上传调用 20,601 次、620,626,468 bytes，API 同步时间约 176ms；该时间不包含 GPU 异步执行，不能据此排除驱动/带宽成本。

静止 CPU 以 idle 为主但仅约 35 FPS，存在独立的几何/透明/GPU 限制。返回段约 32.56 FPS / P95 49.8ms，其中 `bufferData` CPU self 约178ms，资源首次激活/重新分配也需要处理。原路径释放20 tiles、10 LOD resources、777 batches：批二8秒空批释放使返回容易重新分配。无 Shader、页面或上下文错误，没有访问档案存储。

原始证据（仓库忽略的大文件）：`artifacts-local/pine-batch3/baseline-profile/`，每段 `.cpuprofile`、完整帧间隔、资源和截图位于 `results.json`。后续干净复测独立记录，不能混合结果。

无 profiling 基线 `baseline-clean/`：静止36.29 FPS/P95 33.6ms；密集前行38.57/P95 66.6ms/P99 100ms，5帧>100ms；斜行57.66/17.2ms；转向并前行41.83/33.6ms；连续转向33.85/50ms。碰撞和受限 delta 使键盘路径不能保证逐点一致，所有相机轨迹保留在原数据中，不能据单段 FPS 作严格同帧 A/B。

## P1：Blender 工作流实际验证

- 官方 [Codex MCP 文档](https://developers.openai.com/codex/mcp/)确认 stdio / Streamable HTTP 与 `mcp_servers` 配置支持。社区 [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)当前改名 mcp-for-blender；2026-11-03 `git ls-remote` HEAD `992233bb258975a05eec8b5691465c50c2831e34`，审阅 README/addon/server，addon1.8声明最低Blender3.0。公开源码存在 Codex 配置和插件说明，是持续演进社区项目，非 Blender/OpenAI 官方维护。
- addon 默认 localhost:9876 socket，无认证/加密，`execute_blender_code`实际有任意Python权限；safe mode是静态检查，不能当作安全沙箱。现版本还含多个外部资产/生成服务和遥测，`DISABLE_TELEMETRY=true` 才完全关闭。安装通常需Python/uv、addon与客户端配置；插件方式还需重启Codex。没有运行远程一键安装脚本、改变执行策略或修改全局Codex/Blender配置，也没有宣称当前会话已暴露Blender MCP工具。最低版本声明不等于已完成4.4.3 MCP连接实测。
- 采用用户允许的原生Python退路，实际启动本机Blender4.4.3读取**字节相同的隔离副本**。读取299对象、267 meshes、53材质、128图像，检查`pine_02`/`silver_fir_02` Geometry Nodes、`pine_twig`/`fir_twig`原纹理、颜色空间和Translucent/Transparent/Mix节点。复制`rock_moss_hand_placed_03`（4912 vertices/9826 polygons），临时平移0.125m、恢复原位置，原生glTF导出成功（含UV和原材质），随后移除临时对象。不保存任何blend。
- 可复现脚本：`scripts/forest-lab/verify-blender-workflow.py`；实际log、`workflow.json`、133,936,548-byte原精度rock GLB位于`artifacts-local/pine-batch3/blender/`。该导出只证明专业工具链可用，不进入运行时、不代表性能优化。副本位于`%LOCALAPPDATA%/UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch3-work/pine-forest-copy.blend`。

原针叶材质包含离线透射与多层混合，现有glTF的简单PBR不能等价；不凭改灯光或暴力减面声称修复。下一步先用代表树实验评估Alpha覆盖，再决定是否接受。

## P2/P3：局部资产与运行时检查点

保留原有地被40m、树95m和低档LOD条件。每tick按asset/tier解析一次资源，淘汰逐实例`request/now`；平方距离先裁掉远处候选。使用生成器对视锥选择、实例成员维护及矩阵写入分帧，约4ms主动预算（不是硬实时上限）；相机快照保持一次选择一致，旧画面继续渲染。固定静态实例槽位，新增/交换移除才写矩阵，合并相邻更新区间。Impostor仍按相机更新和原排序。批次容量加25%余量，减少反复扩容；资源释放策略保留。

诊断版初测 `optimized-profile/`：原机位仍7,338,065 tris/141calls；密集前行46.70 FPS/P95 33.5ms，上传145.1MB（旧620.6MB）；调用次数54,595反而高于旧20,601，说明区间上传以更多小调用换较少字节，并非免费收益。CPU `update` self1237ms、`advance`约336ms，`request`不再是热点。不同速度引起细微路径差异，不能声称精确百分比提速。GPU timer非阻塞、丢弃disjoint样本：原机位中位24.73ms/P95 27.68ms；密集林带转向中位29.39ms/P95 51.38ms，CPU已大部idle。后者仍未达到每段P95<=40ms，后续只做独立干净复测，不无限调参。

仅选`pine_04`（原近景每株669,452 tris，机位18m内至少5株）为更多角度图集试点，直接复用完整源网格、验证1K材质和批二烘焙场景。现有8视角384×768/视图提升到16视角512×1024，2048×4096 WebP，3,637,424 bytes，源bounding box/center不变。每22.5°切换，仍然是平面表示，没有声称消除切换或实现深度视差。只在较高精度加载该图集；低档仍用旧8视角，原资产全部保留。新增静态RGBA8+mip估算约30.67MiB（不是VRAM实测）。未重新处理其余10树种或修改任何散布坐标。

`pine_02` Alpha-to-coverage 原图集/网格试验已截图：低阈值0.03+MSAA覆盖比BLEND近景显得较丰满，几何数量不变，但颜色/遮挡与源Cycles仍有差异。仅保留显式`alpha=coverage`试验参数，材质池隔离避免影响其他树种；不自动推广、不宣称完成针叶材质修复。8-sample Cycles原材质单树渲染完成，3317021 polygons，720×450，原世界/灯光；与Three.js环境不同，作为材质对照而非等价渲染。

此检查点仍待最终干净漫游、高档、录屏、矩阵审计与回归。
