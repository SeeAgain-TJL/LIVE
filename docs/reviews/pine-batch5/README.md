# Pine Forest Batch5 · 原河床森林样板（2026-11-04）

基线为已推送的Batch4 `f46928f`；工作区干净、原stash保留，继续当前开发分支，不合并main、不改正式用户数据。

## 第一阶段：加载与性能基础

- 地面GLB、三层材质和纹理上传就绪后才启动植被流送；surface失败进入真实错误提示，不显示悬空树概览。启动时即标记流送场景，避免Walker把仅地形首帧当作完整森林。
- 已用网络拦截故意阻塞地面遮罩：阻塞期间无植被流送/几何就绪/森林就绪；释放后地面与植被正常出现。见startup.json，截图在忽略目录。
- 保留现有LOD、材质、原坐标及流送架构。近景真实树批次按8m小树组划分，并启用原几何部件的视锥剔除；不减面、不改变实例源记录。试验过的8页精确三角形分块因解析开销和draw call增加、收益不稳定，已撤掉，未成为新增LOD。
- 基线GPU查询（EXT_disjoint_timer_query_webgl2）实测：起点GPU中位25.63/P95 39.76ms，密集静止28.42/35.39ms；CPU采样以idle为主。流送中还有解码/构建/上传尖峰。原始诊断在artifacts-local/pine-batch5/phase1-baseline，摘要见phase1-summary.json。
- 改后相同输入脚本的实际移动轨迹仍受碰撞影响，非逐点受控对照；低档80%性能见phase1-summary.json。尚未通过所有路段平均30FPS/P95≤40ms门槛，不以不降画质的局部剔除夸称解决核显GPU预算。
- 实际通过lint、typecheck、46项单元测试、production build、加载顺序回归、低档连续WASD/鼠标输入及资源释放/档案隔离断言。没有新增运行资产；原207文件Batch4包继续可用。

第一阶段提交 `0072fbd`，Push成功，远端完整哈希 `0072fbd4f33e16b8b273d962f8153aebc53581d0`。

## 第二阶段：原河床环境样板候选

入口 `/forest-runtime-lab?scale=0.8&sample=creek`。原始Blender XY (-40..40,-75..-15)约80×60m河床与两侧林坡为核心，缓冲范围沿原坐标放置188棵源树，不重新散布森林。Blender派生场景含33,888个源地被/岩石记录，34,079对象；这不是新加33,888个浏览器实例。浏览器继续消费已有分区，只对核心蕨类/冷杉幼树把显示范围从40m延至55m。

地形仅核心细分及按原位移图/path/river权重施加小尺度起伏：127,845顶点、126,980面，69,655顶点发生位移，最大约0.194m，2m边缘淡出。宏观地形与树位不变，河床碎石仍是源网格。BVH重采样碰撞高度，Walker样板选项沿树干/边界滑动，保留0.8m树干碰撞和原行走边界。没有重建地面Shader、树木LOD或流送系统。

2K静态AO从该源布局烘焙，浏览器复用标准aoMap；半球光、暖主光和指数距离雾提供环境明暗。未添加昂贵实时阴影/后处理，静态AO不等于动态太阳树影。派生Blender显式几何起伏后移除材质Displacement连接，避免双重位移；原官方文件未保存修改，SHA-256仍为 `fdce77741081f462f11e5cefe8bf79a0bc796727dbb6e51d12fc6cf20e9c9cfb`。

### 图像与预算

近中远景浏览器图及Blender派生样板参考均本轮新生成；静态截图使用显式review接口，录屏另行使用真实输入。

| 视图 | 浏览器 | Blender/浏览器同机位 | 7秒静止平均FPS / P95 |
| --- | --- | --- | ---: |
| 近景 | [近景](near-low.webp) | [近景对照](comparison-near.webp) | 34.24 / 34.7ms |
| 中景 | [中景](mid-low.webp) | [中景对照](comparison-mid.webp) | 47.94 / 33.5ms |
| 抬高远景 | [远景](far-low.webp) | [远景对照](comparison-far.webp) | 25.18 / 64.2ms |

Chrome156，CSS1440×900，内部1152×720，低档。位置/方向、48.5°垂直FOV与16:10画幅匹配；Blender为960×600、Cycles16sample降噪、1K渲染纹理限制。它使用已有近树/中地被PBR网格，**不是完整原始Cycles树**，DCC预览省略微小苔藓卡片且核心外无地被。不同LOD、天空/光照、色调映射与雾使两者明显不同；只能比较构图、几何和资产保留。中远景不能声称源画质恢复。

工程检查lint、typecheck、46项单元测试、production build通过；样板延迟地面遮罩的启动回归通过。近中远静态机位位置与实际相机一致、无浏览器/HTTP错误、低档未加载真实mid。`stills.json`、`sample-startup.json`、`sample.json`、`blender-comparison.json`保存证据。

第二阶段不录屏连续真实输入已完成：移动输入段合计89.10秒、45.64FPS、P95 33.5/P99 50ms、无超100ms帧。按合并移动样本满足平均30/P95≤40，但转向段32.75FPS/P95 50ms，故更严格的每段门槛仍失败。首次森林5.36秒/稳定8.38秒，释放23分区/15资源；浏览器错误、context事件及档案存储访问为零。输入路线到达边界并受碰撞影响，最终距起点113.52m，没有真正回到起点；统计包含输入被阻挡时段，不称全程都在移动。详见 `phase2-performance.json`。单机单次，未严格控制温度/后台负载，不和历史不同轨迹量化精确改进百分比。

### 资产与跨设备制作

运行包包含211文件/215,768,748字节，见 `runtime-assets.json`。ZIP约181.82MB；制作ZIP约1.278GB，包含约1.744GB派生blend、AO、报告和构建/渲染脚本。所有ZIP成员已重新流式读取并核对SHA-256，详见 `asset-packages.json`。145张图全部packed、无外部贴图依赖，Blender4.4.3重开审计通过（`packed-authoring.json`）。制作ZIP足以继续编辑这一片样板，普通Git不包含GLB/贴图/blend。

两个ZIP已上传至[GitHub开发预发布](https://github.com/SeeAgain-TJL/LIVE/releases/tag/pine-batch5-sample-20261104)，指向第二阶段 `820b504`，服务端文件大小与SHA-256均匹配；完整URL/哈希见 `remote-assets.json`。运行ZIP为181,817,406字节，制作ZIP为1,277,746,715字节。已实际从公开下载地址重新下载运行ZIP并验证SHA-256，再解压校验全部211资源。此前Batch4运行ZIP没有本轮新增的4个batch5文件，不能只用旧包运行样板。

```powershell
git checkout codex/pine-forest-vertical-slice
npm.cmd ci
# 解压本轮运行ZIP得到runtime/，恢复时拒绝覆盖内容不同的已有资源。
node scripts/forest-lab/transfer-batch4-assets.mjs restore --manifest docs/reviews/pine-batch5/runtime-assets.json --from D:/pine-batch5/runtime
node scripts/forest-lab/transfer-batch4-assets.mjs verify --manifest docs/reviews/pine-batch5/runtime-assets.json
npm.cmd run build
npm.cmd start
# /forest-runtime-lab?scale=0.8&sample=creek
```

继续编辑：解压制作ZIP，用Blender4.4.3打开 `authoring/pine-batch5-creek-stand.blend`，不需要本机原纹理路径。若从官方源工程**重新运行整条派生链**，另需原始pine_forest.zip、textures/、同哈希的pine-forest-copy.blend、原render-inventory.json/runtime-tiles、glTF-Transform工具环境和解码输入。以上完整原始派生工作目录没有装入本轮制作ZIP，不能声称新设备单靠npm ci即可重建。现成运行ZIP与packed样板免除此重建前提。

### 仍待视觉验收

- 近景针叶仍稀、Cycles透射/枝片明暗不等价；保留原资产而未新做树冠Shader/LOD实验。
- 中远景Billboard没有枝叶视差，和几何树切换、固定图集光照及边缘重影仍可能可见。
- 地被显示范围边缘、初次补齐弹出、低档远林的裸地感尚在；核心外没有做完整环境制作。
- 原三层材质频率仍是实时近似；局部位移不能替代高密度源Cycles微几何。静态AO不能产生动态树影，河床目前为干河床，没有新增河水。
- 抬高远景尚低于30FPS/P95≤40ms目标；候选保存交付不代表高品质森林已验收通过。本批证据与资产保存后停止，交给用户视觉验收。

第二阶段提交 `820b504`，Push成功（`0072fbd..820b504`）；工程四项检查、启动回归、静帧、连续输入和packed制作审计均已执行。大型资产附件另上传并校验，不以Push替代资产恢复。

## 第三阶段：连续探索、GPU与交付

### 连续真实漫游

[80.4秒未剪辑审阅视频](continuous-walk-review.webm)，[六时点预览](video-timeline.webp)。1440×900原件45,298,891字节保留于 `artifacts-local/pine-batch5/sample-walk/continuous-movement.webm`；Git同步960×600、10,652,420字节审阅版，只做空间/码率压缩，时间线完整。

`record-batch5-sample.mjs` 使用现有Walker的W与D、鼠标按住拖动，自适应朝向仅**读取**诊断位置/方向，不写相机，不启用review、不发相机事件。路线始终在核心80×60m内，采样累计约183.70m；六个目标中五个接近至3m内，一个因树干绕行/时限未到达。包含停步、避障及观察，不声称每帧都在移动。核心探索窗口69.37秒，录屏平均40.58FPS/P95 33.8/P99 50.1ms；错误、context事件、localStorage和IndexedDB访问为零。录屏实际到达近起点，不用瞬移拼接返回。

另一条既有连续输入脚本扩展至样板外，提供不录屏参考：移动输入段45.64FPS/P95 33.5ms，逐段转向P95 50ms；合并门槛满足而严格逐段门槛失败。其录屏版与制作包上传重叠，帧时明显较差，保留于 `final-walk` 并在motion-summary标明，不拿它和干净样本量化录屏开销。核心录屏、干净路线、GPU诊断均为不同采样轨迹/模式，不是严格单变量A/B。

### 实际GPU定时

Chrome156/Intel Graphics (0xA7AA)/ANGLE D3D11，CSS1440×900、DPR1、内部1152×720、低档；GPU任务串行，没有同时跑Blender或另一浏览器场景。`profile-batch5-gpu.mjs` 对近中远静态审阅机位执行 `EXT_disjoint_timer_query_webgl2`，每机位10秒采样；382/494/252个有效查询，disjoint事件均为0。以下是实际GPU elapsed time，非由FPS倒推，也未测得显存。

| 机位 | GPU中位 / P95 (ms) | 三角形 | draw calls | 诊断模式FPS / P95帧间隔 |
| --- | ---: | ---: | ---: | ---: |
| 近 | 24.09 / 30.30 | 6.40M | 147 | 37.57 / 33.6ms |
| 中 | 18.55 / 23.53 | 4.34M | 145 | 47.87 / 33.4ms |
| 抬高远景 | 37.73 / 44.34 | 8.58M | 183 | 24.86 / 66.6ms |

CPU采样以idle为主，远景大可见集的GPU预算不足明确；不能只优化JS就承诺解决。首次近景收敛约6.81秒，CPU profile含texSubImage2D约1.30秒、Shader日志等待约0.47秒；近/中/远采集窗口累计buffer上传约94.7/33.4/51.6MB、API调用CPU约97.5/53.0/92.2ms。上传计数不含纹理传输字节，不能把它当总GPU带宽或显存。原始CPU profiles、长任务和完整诊断在忽略目录，精简数据与每秒位置/方向保存在 `motion-summary.json`。

核心录屏的合并平均30/P95≤40门槛通过；大可见集远景与扩展路线转向仍未全部通过，保持为明确剩余问题，不进一步扩大场景或盲目降低现有画质。

### 恢复与媒体验证

远端运行ZIP下载/解压后，全部211资源SHA-256通过；浏览器所有森林资源请求定向该独立解压目录，无本机原资产兜底。低/高档实际资源、地面/树木就绪、WebGL状态及低档无真实mid/高档有真实mid分别断言。恢复预置不同内容文件会整体拒绝，不覆盖已有成果。此为同机隔离目录验证，不冒称另一台实体设备已测。

原版和审阅版视频分别在Chrome解码、跳转9/21/33/45/57/72秒并实际播放；时长、分辨率、媒体错误及跳转断言见 `delivery-verification.json`。本阶段新增脚本lint通过，运行时代码与第二阶段四项工程检查时一致；没有重新跑正式站点全套test:e2e、手机或其他GPU，也没有测可靠VRAM/长期压力。

制作包全部成员哈希通过，packed工程重开通过，能继续编辑本样板。完整官方原始资产/历史派生输入未一起上传；从零重跑源转换仍按上方要求另备。样板制作、证据与跨设备交接至此停止，待用户视觉验收；不合并main、不修改正式Galaxy/Planet/Memory或用户数据。
