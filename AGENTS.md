# UNIVERSE OF ME 开发约定

这是用户长期使用的私人数字记忆项目，不是一次性展示页。继续任何工作前，先读 `README.md` 与 `docs/{PRODUCT,ARCHITECTURE,PROGRESS,DECISIONS}.md`，检查工作区，不覆盖用户已有修改。

## 不可违背的产品原则

1. 星球是核心实体，代表用户自己定义的人生阶段。**绝不替用户命名人生阶段或虚构经历**；名称可为 `null`，UI 显示「未命名草稿」。示例必须明确标注。
2. 使用真正可交互的 Three.js 场景。不要用背景视频/静态图冒充 3D。
3. 重点顺序为星球质量、镜头控制、空间感、交互可用性。正文属于结构化档案，不贴在旋转球面。
4. 每个可点击控件必须能完成它表示的动作。未实现功能说明后续计划，不做假按钮。
5. 默认私人。当前本地开发版没有鉴权/加密/云存储，不得声称具备正式隐私保障。
6. 数据归用户所有。不得因迭代静默清空档案；所有持久化结构变更必须有版本迁移与备份/恢复验证。

## 工程边界

- Next.js App Router、React、strict TypeScript、Tailwind 4 + 全局设计样式。
- Three.js / R3F / Drei；目前不需要 GSAP 或重型后处理。动画循环用 ref 与 `useFrame`，不要每帧更新业务 React state。
- `components/three` 仅接收强类型 props，不从 provider 直接读写星球/记忆。可选镜头书签除外。
- `domain` 保持纯 TypeScript、不依赖 React/Next；`data` 提供仓库接口、校验与迁移入口；业务组件不要散落 `localStorage` 调用。
- 当前存储是浏览器 localStorage。未来使用 PostgreSQL + **Prisma**，不混用 Drizzle；服务端权限检查是必需的。
- 后续媒体必须走私有 S3/R2 对象 + 鉴权后的短期 URL，不将密钥放入 `NEXT_PUBLIC_*`。
- 不把正式数据模型塞成大型 JSON；本地版本化传输快照与未来关系数据库是两个不同层次。
- 用户输入按纯文本渲染；不要引入 `dangerouslySetInnerHTML`。富文本以后必须经过安全解析与版本设计。
- 尊重 reduced-motion，提供简化渲染和非 WebGL 档案访问途径。对话框保留焦点管理和 Escape 支持。
- 不擅自升级生产数据结构或新增与当前阶段无关的复杂基础设施。

## 检查与交接

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

本环境 PowerShell 禁止 `npm.ps1`，使用 `npm.cmd`，不更改系统执行策略。测试运行器使用 `--test-isolation=none`，避免受限环境禁止创建子进程。

第一轮依赖安装被网络/审批配置阻断，**不能默认项目已经通过构建或浏览器验收**。先核实当前进度。安装成功后生成 lockfile，再使用 `npm ci`。网络问题不要通过关闭限制或绕过审批解决。

主要手动验收路径见 `docs/PROGRESS.md`。每轮更新该文档：完成了什么、实际跑了什么、失败/未验证什么、下一步做什么。技术取舍更新 `docs/DECISIONS.md`。不要把计划写成已实现；不要把未执行的检查写成通过。
