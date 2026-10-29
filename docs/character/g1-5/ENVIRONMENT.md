# G2.1 环境能力检查 · 2026-10-29

这是一次当前环境检查，不能证明整台电脑所有磁盘和便携目录绝对没有软件。

| 检查 | 方式与结果 |
| --- | --- |
| PATH | `Get-Command blender` 未找到可执行文件；Python 命令指向 WindowsApps 别名，未把它当作已验证的 Python/Blender 环境 |
| 常见安装记录 | 查询 HKLM/HKCU Uninstall（含 WOW6432Node），Blender、VRoid、Maya、ZBrush、Cinema 4D、MakeHuman 无匹配结果 |
| 常见安装/下载目录 | 在 Program Files、Program Files (x86)、LocalAppData/Programs、Desktop、Downloads 搜索 blender/VRoid 可执行文件及 `.blend`/`.vroid`，未发现匹配；不是全磁盘扫描 |
| 当前进程 | 未发现 blender/VRoid 进程 |
| 可调用工具 | 当前工具清单没有 Blender、VRoid 或人物网格生成接口；未发现可执行的高质量人物重建流程 |
| 已可用 | Node、sharp 图片处理、现有 Three.js/VRM 浏览器运行与测试能力；能做参考核对和未来模型查看，不能据此声称会生成忠实角色模型 |
| 现有模型 | pixiv 技术样本保留，不使用它冒充这两张图对应的人物；未发现用户当前角色的可编辑建模源文件 |

结论：G1.5 的参考归档、可视化对齐与规范整理可执行；当前未具备可验证的高还原度人物建模生产能力，G2.1 没有实物交付。不是审批或账号阻断，不需要用户重复授权。未安装新建模软件、未提交外部生成服务、未消费付费建模资源。

可行的后续路线：在有 Blender/VRoid 的实际制作环境中先完成并审核脸/眼/发/耳的真实头部样模；可采用专业建模流程，VRoid 仅作为可编辑起点，默认脸/默认发型不能直接交付。工具安装、原图送审或任务转交均不等于模型已制作。
