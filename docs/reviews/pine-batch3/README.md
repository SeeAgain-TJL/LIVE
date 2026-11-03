# Pine Forest 第三批

起点：`bfe419b`，分支 `codex/pine-forest-vertical-slice`。本批只处理隔离森林的诊断、Blender 工作流、同源资源和运行时性能；不接入正式星球。

**结论：低精度80%内部分辨率具有可用性能；森林自然度仍未完成最终验收，本批结束。** 原生DPR1的CPU移动尖峰显著减少，局部密集林带仍受GPU负载限制。Blender原生Python工作流实际通过；MCP未安装，未假称连通。

| Chrome实测配置 | 移动平均FPS | 移动P95 | 关键限制 |
| --- | ---: | ---: | --- |
| 优化前DPR1，密集前行段 | 38.57 | 66.6ms | 同期profiling可到83.4ms |
| 最终DPR1，密集前行段 | 47.03 | 33.5ms | 原7.34M三角形机位保持 |
| 最终DPR1，完整移动含返回 | 42.05 | 33.6ms | 局部转向/回程仍约50ms |
| 80%低档，完整移动含返回 | 48.85 | 33.5ms | 内部1152×720，有画面/屏幕LOD代价 |
| 80%低档，真实录屏 | 47.09 | 33.5ms | 154.8秒完整视频，编码25fps |
| 较高档DPR1，完整移动含返回 | 27.73 | 50.4ms | 当前核显不推荐 |

完整移动的前后路径受碰撞/帧时间影响，不能与“密集前行段”混作同一指标；逐段数据见[精简结果](summary.json)。

直接审阅：[近景](low80-near-static.png) · [移动地被](low80-walk-forward.png) · [中景林带](low80-mid-static-release.png) · [转向后的林冠](low80-far-static.png) · [返回](low80-dense-return.png) · [较高档](higher-near-static.png)。原型真实近/中/远视距：[近](near-comparison.png) / [中](mid-comparison.png) / [远](far-comparison.png)；[Blender原材质与Three.js](blender-three-original-material.png)、[Alpha候选](alpha-coverage-comparison.png)。

本机连续视频：[continuous-movement.webm](../../../artifacts-local/pine-batch3/final-video80/continuous-movement.webm)。入口：`http://127.0.0.1:3310/forest-runtime-lab?scale=0.8`；较高档：`?quality=high`。大资产与视频不进入普通Git，保持仓库外归档与SHA256清单。

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

## P4：联合验收记录

独立无profiling DPR1 (`low-dpr1`)：移动88.08s，平均40.93 FPS/P95 33.7ms/P99 50.2ms，0帧>100ms。密集前行46.95/P95 33.4；转向前行36.75/33.7；连续转向32.49/50；密集回程30.82/50.1。**整体移动P95通过，但局部段仍不满足<=40ms，DPR1不宣称全部通过。**

最后补验`final-dpr1`包含新建实例批次`count=0`和画质切换旧指标清理修复：完整移动87.51s，42.05 FPS/P95 33.6ms/P99 50.2ms，1帧>100ms；密集前行47.03/P95 33.5，密集回程31.57/P95 50。无浏览器/Shader/上下文错误，首次2.47s、初始资源完成6.51s，累计136.89MB，释放35tiles/14resources/734batches。修复仅影响未就绪批次显示/指标，不改变稳态LOD/几何/分辨率。

串行最终80%低档 (`final-low80`)：CSS1440×900/DPR1，内部1152×720。移动89.28s，48.85 FPS/P95 33.5ms/P99 49.9ms，0帧>100ms，逐移动段目标均通过。原机位screen-space LOD也随内部像素调整，约6.92M triangles/142 calls，不是只有像素填充改变；没有删树/抽掉源植被。首森林2.21s，初始资源完成8.36s，运动累计资源136.94MB。释放35tiles/13LOD资源/757批次，记录旧分区重新进入。此结果仅代表该路径和短时环境，不是全森林/长期热稳保证。

`run-batch3-acceptance.mjs`强制所有图形任务逐个进程等待退出，生产Chrome、同测试视窗、不和Blender/截图并发。早期`high-dpr1`回程、`low-dpr1-final`未完成录屏、`low-80-clean`末段与另一浏览器重叠，全部排除；保留`overlap-invalid/README.txt`说明，不引用为性能结论。CPU/GPU profiling用独立profile文件，不与clean样本混合。

路径真实性限制：WASD与拖动均通过真实Chrome事件执行，受原碰撞与`min(delta,0.05)`影响，返回可能有侧移/不能精确复走每个点。逐秒真实相机/朝向/分区清单均在JSON，记录重新进入旧分区验证缓存，不把“同输入”写成逐坐标相同路线。`far-static`只是测试阶段名，实际最终林带有8M左右近景针叶几何，不能把它描述为纯远景轻画面。

较高精度串行 `final-high`：移动91.20s，27.73 FPS/P95 50.4ms/P99 67ms，8帧>100ms；原机位9.57M tris/162 calls；密集视角最高12.42M。转向前行24.15 FPS、部分返回21.68–22.05 FPS。首森林2.46s/资源补全9.83s，累计152.17MB。**当前Intel核显不推荐较高档，保留给独显/资产审阅，不以新atlas当作整档性能改善。**

真实连续录屏串行 `final-video80`：移动91.54s，47.09 FPS/P95 33.5ms/P99 34.1ms，0帧>100ms；所有移动段平均>=30/P95<=40。此统计来自浏览器rAF，视频文件的编码帧率不等于渲染帧率。包括自由前行、斜行、连续转向、驻留/释放和键盘回程，未经剪接。视频在`artifacts-local/pine-batch3/final-video80/continuous-movement.webm`，静态图随审阅提交。

当前推荐：**低精度 + 80% 内部渲染**，维持第一批1K地被/近景树贴图、源布局、40m地被/95m树和旧8-view。100%更清楚但某些转向/回程仍50ms；80%画面略软、屏幕LOD随像素减少，对全程帧时间更有余量。不能将80%结果标为原生1440×900渲染。高精度原模型、源4K材质和原.blend均保留，不在核显运行时同时加载。

视觉未通过最终美术门槛：近景树冠仍较稀、部分针叶与枝干显得生硬；中远景仍有平面感/视角跳变和固定烘焙光照；新16-view只改善一个树种，不能消除所有角度切换；原Cycles透射/层次混合未等价；地形纹理仍浅且模糊，原河流材质未完整恢复。当前截图可见树林与地被、岩石和原山坡，无绿色代理或新增替代布局；**运行性能改善不等于森林自然度已验收。** 按停止条件保留这些具体问题，不再扩大本批。

特别是前行登坡截图有较大浅色裸露地表，不能把“原矩阵未变”当作视觉必然合格，也没有以这张较轻画面代替原机位或密集林带测试。原地被实例仍按源规则/40m范围筛选；坡面烘焙和层次须在下一次单独授权时集中审查。

## 数据完整与交接

`verify-batch2-assets.mjs`实际重新验证全部880410条记录：585树、879825地被、60源分区和既有仅树边缘块完整，原名/矩阵最大float32误差5e-8，原.blend SHA256不变。原相机方向仍`[-0.9821439487,0.1260486988,-0.1396602648]`。原机位几何归因：trees4,468,197、props2,738,784、terrain131,084，共7,338,065 tris，141calls/78textures；主要近景贡献pine_04三株2,008,356、pine_03两株1,151,426、silver_fir_03两株899,390。80%低档prop屏幕LOD改变后约2,322,072 prop tris，树数量/位置不改。38张已验证1K地被图像及原高精度源继续保留。

运行时矩阵审计在真实移动/转向中对成员数量、slot map及稳定旧槽/新增/交换槽的抽样原矩阵作比较；一次有效审计258577样本/131更新，最大误差3.81e-6。画质选择low→high→low可实际切换。首个断言误计Next.js的空`role=alert`播报节点，修正为只检查非空错误，再验通过；没有Shader/页面错误，不把早期错误记作成功。主动注入context loss的提示、撤销ready和重载恢复通过。移动中的Storage和IndexedDB访问均为零，全部测试使用独立Chrome临时profile，未接触用户日常站点档案。

最终代码再次审计457857样本/204更新，最大误差仍3.81e-6；新建批次未填充前count为0，切换精度清空旧streaming指标，low→high→low实际加载完成后检查通过。[矩阵审计](instance-audit.json)和[上下文恢复](context-recovery.json)为最终有效证据；[串行队列记录](acceptance-jobs.json)保留最初空alert断言失败，不篡改为通过。

普通Git保留代码、审阅图片和精简JSON；154.8秒/25fps/1440×900真实视频74,419,347 bytes保存在忽略目录。新16-view两文件校验副本保存在`%LOCALAPPDATA%/UNIVERSE-OF-ME/asset-audit/candidate-assets/pine-source-conversion/batch3-delivery/`，原batch2-delivery不变。没有修改正式Galaxy/Planet/Memory、provider/schema/存储、未合并main、未换引擎或处理其他星球。

检查点：`277b2a7` P0诊断、`7c54ffc` Blender原生副本工作流、`4af8db2`运行时/单树试点；最终提交见Git日志。lint、strict typecheck、46/46单元、生产build、33/33隔离Chrome回归实际通过。全站回归使用独立3100 origin的测试fixture，不能外推真实手机/其他GPU/长期热稳。
