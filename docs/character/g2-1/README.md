# G2.1 · Blender 环境与基础模型草稿 01

> 2026-10-30 用户审查结论：**视觉验收不通过，停止程序化草稿制作路线。** 本页及脚本仅保留技术复现用途，不继续以此草稿作为正式人物基础。当前工作见 [VRoid 工具与制作路线评估](VROID-ASSESSMENT.md)。

日期：2026-10-30（环境准备与草稿生成于 2026-10-29，复核于 2026-10-30）。**环境已运行、VRM1 往返验证已通过，已生成独立真实模型草稿与实际渲染；角色还原度未达验收要求。** 这是对上一轮「未具备建模环境」状态的更新，不是追溯修改历史结果。

## 打开本地实物

资产根目录：`C:\Users\tingjie.li\Desktop\UNIVERSE-OF-ME-assets\g2-1`。

- 双击根目录 `review.html`：查看真实三视渲染、头部近景和 4 秒相机环绕视频。
- 双击根目录 `Open silver spirit draft.cmd`：在便携 Blender 中打开可编辑工程。
- 模型：`silver-spirit-draft01/silver-spirit-draft01.blend`，内嵌两张当前参考图；`silver-spirit-draft01.glb` 为静态查看用。
- 实际渲染：`front.png`、`side.png`、`back.png`、`three-quarter.png`，以及三个 `head-*.png`。
- 实际视频：`turntable-draft01.mp4`，48 个 Cycles 渲染帧 / 12 fps / 480×640；相机旋转，人物无动作。
- 独立环境测试：`pipeline-test/` 中的简化人形、VRM 和三视渲染，仅验证管线，不是角色资产。

仓库内的小型复核证据：[`evidence-smoke-report.json`](evidence-smoke-report.json)、[`evidence-verification.json`](evidence-verification.json)、[`evidence-asset-manifest.json`](evidence-asset-manifest.json) 和 [`evidence-browser-review.json`](evidence-browser-review.json)。浏览器复核还在外部资产目录 `evidence/` 保存桌面/390px 截图；这些截图和模型二进制不提交 Git。

源代码中的 [run.cmd](../../../scripts/blender/run.cmd) 支持：

```powershell
scripts\blender\run.cmd open
scripts\blender\run.cmd verify
scripts\blender\run.cmd smoke
# 给一个新的输出目录，不覆盖手工编辑工程
scripts\blender\run.cmd draft "C:\Users\tingjie.li\Desktop\UNIVERSE-OF-ME-assets\g2-1\new-study"
```

不用更改 PowerShell 执行策略。打开 UI 是用户主动操作；自动化测试使用后台模式，没有在工作过程中弹出安装界面或要求管理员权限。

可用 `node scripts/blender/verify-review.mjs "C:\Users\tingjie.li\Desktop\UNIVERSE-OF-ME-assets\g2-1"` 重新检查离线审阅页。它只读取外部资产、启动隔离 Chrome 并写入外部 `evidence/`，不会打开网站或访问浏览器档案。

## 环境与下载

| 项目 | 实测 / 使用版本 |
| --- | --- |
| 系统 | Windows 11 专业版 x64，10.0.26200 |
| Shell | PowerShell 5.1.26100.9711，系统 curl 可用 |
| 磁盘 | 下载前 C 盘约 755.6 GiB 空闲，计划预算 8 GiB；工具目录实际写入成功 |
| Blender | **4.2.23 LTS**，官方 Windows x64 ZIP 约 365.4 MiB，展开约 926.5 MiB |
| Blender Python | **3.11.7**；原系统 python/python3 是 WindowsApps 别名，没有依赖或修改它们 |
| VRM Add-on | **4.10.2**，维护者官方仓库发布包；manifest 声明 Blender 4.2.0–5.3.0 边界，实际 4.2 导入导出已验证 |
| 渲染 | Intel Graphics；使用 Cycles CPU，不依赖 GPU CUDA/HIP，也不改系统显卡驱动 |

Blender：`https://download.blender.org/release/Blender4.2/blender-4.2.23-windows-x64.zip`。

官方 SHA-256 清单：`https://download.blender.org/release/Blender4.2/blender-4.2.23.sha256`。已比对 ZIP：`82e791475779a7342424a480bdde9a20b43710da9264c60346125aa16cd910cb`。

插件：`https://github.com/saturday06/VRM-Addon-for-Blender/releases/download/v4.10.2/VRM_Addon_for_Blender-4_10_2.zip`。已比对 GitHub release asset digest：`c02baf55b83a409fbc01e5c1912d7c8eff2807ce1a23d20eb6c049d1fb1d469c`。两种插件许可与原包保留，未移除声明。

工具位置：`%LOCALAPPDATA%\UNIVERSE-OF-ME\tools\blender-4.2.23-windows-x64`。插件安装在该便携版的 `4.2/scripts/addons_core/io_scene_vrm`；配置在同目录 `4.2/config`，启动入口明确设置 `BLENDER_USER_CONFIG`。未更改系统 PATH、注册表、系统 Python、执行策略或其他软件配置；没有管理员提权。第一次放到旧 `scripts/addons` 位置未被 Blender 4.2 扫描，改为便携包实际扫描目录后通过。

原始 ZIP 仅留在工具目录缓存，绝不提交 Git。工具/插件重新获取时必须复核上游 URL、版本、大小和散列；不要下载重打包第三方安装器。

## 自动完成的内容

1. 官方下载、校验、便携解压、插件放置与独立配置；Blender 后台成功运行。
2. [最小测试脚本](../../../scripts/blender/smoke_test.py)：生成明确标为 TEST 的简化人形、17 个 VRM humanoid 映射骨骼，保存 `.blend`，后台渲染正/侧/背，导出 VRM1，再重新导入检查骨架/网格。不是用已有 pixiv 样本测试后说成新人物。
3. [角色草稿脚本](../../../scripts/blender/build_character_draft.py)：从零构造可编辑脸部曲面、眼睛/眉睫/嘴唇、独立狐耳、银蓝渐变发束、身体/手部草稿、简化礼服/袖片与单条尾；未使用 pixiv 模型、下载底模或把原图贴到平面冒充角色。
4. 两张唯一当前基准图打包进 `.blend` 的 `REFERENCE_ONLY_NOT_RENDERED` 集合；原像素不改。`G01_DRAFT_EDITABLE` 保存模型，`STUDIO_AND_CAMERAS` 为灯光/转台；工程内 `READ_ME_DRAFT_STATUS` 说明限制。
5. GLB 导出保留发色顶点属性，避免 Blender 程序材质导出后变成纯白；基础色还会随查看器光照有差异，没有最终贴图。
6. 保存工程在渲染之前执行；生成器默认拒绝覆盖已有 `.blend`，手工修模必须另存新版本。

## 当前草稿的真实局限

这是程序化体积研究，**不是高质量人物还原或最终美术**。已经查看实际渲染，仍存在：脸部偏概括、眼睑/眼窝不自然、鼻唇细节不足；刘海和长发像较粗的重复束，发根/耳根过渡仍生硬；耳毛和狐尾不是精细毛发；手指与身体关节未做解剖/变形拓扑；衣片缺少真实裁剪和精修装饰。

初次预览发现眼睛凸出、发根接缝与裙内层缺失，已做最小修整并重新渲染，**不据此宣称视觉通过**。没有最终 UV、皮肤/眼睛绘制贴图、生产骨架、表情 shape keys、蒙皮权重或物理；角色自身没有被导出为 VRM。VRM 输出能力只由独立合格测试骨架验证，不能混淆。

原“在此草稿上精修”的后续计划已撤销。改为评估 VRoid 新底模与人工定制头部/基础人体，先审脸，再审头发和身体比例；不沿用当前草稿的脸、发或身体网格。动画和正式集成继续后置。

## 资产管理方案

本轮采取 **仓库内文本脚本/文档/散列清单，仓库外本地 DCC 工程/软件/视频**。未把 `.blend`、GLB、MP4、软件 ZIP 或本轮高分辨率 PNG 写入普通 Git 历史，也未自动上传到云端。

建议在接受模型版本后选择：

- 可编辑工程与大型贴图：Git LFS（先确认仓库配额/团队使用方式），或有版本管理的私有对象存储/独立资产仓库。
- 可公开使用且授权明确的最终运行模型：与源工程分离，按版本发布到受控资产存储，应用只引用版本与 SHA-256。
- 本地每次手工编辑另存 `draft02` 等目录；原始生成稿保留。外部资产目录当前是本机单份，尚无异地备份，不能把 Git 中的清单当作模型备份。

上述 LFS/对象存储只是建议，**本轮未启用、未上传、未改正式资产引用**。工具目录可重新下载，工程和手工资产必须单独备份。
