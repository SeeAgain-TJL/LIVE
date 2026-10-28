# UNIVERSE OF ME · 我的人生宇宙

> 人生不是一条直线，而是一个不断扩张的宇宙。

一个以真实可交互 3D 星球承载人生阶段、以安静的结构化档案保存记忆的个人网站。项目当前为 **第一轮开发原型，尚未完成运行与构建验收**。

## 当前实现

- React Three Fiber / Three.js 实时宇宙，五种程序化材质、行星自转、大气与星环。
- 拖动旋转、滚轮/双指缩放、点选、双击平滑飞行、返回全景、恢复探索位置。
- 独立星球记忆路由 `/planet/[id]`；进入时先飞近再淡入档案。
- 创建/编辑星球：可留空名称、日期范围、持续阶段、介绍、星系、类型、配色、纹理与星环。
- 文字记忆新增、编辑、确认删除、日期排序；星球搜索、跨年份阶段筛选。
- 本地版本化数据、基础校验、冲突检查、上一版快照、JSON 导出。
- 响应式页面、自动/高质量/简化模式、减少动态效果、WebGL 失败提示和档案直达链接。

**五颗初始星球都是外观示例，名称与人生日期均为空，没有自动生成用户经历。**

## 环境与启动

要求 Node.js 22.13+（本轮环境 Node 24.18.0）、npm 10+、支持 WebGL 的现代浏览器。

```powershell
# Windows 若 npm.ps1 受执行策略限制，使用 npm.cmd；不必修改系统执行策略。
npm.cmd install
npm.cmd run dev
```

打开 http://127.0.0.1:3000 。macOS / Linux 使用 `npm` 替代 `npm.cmd`。

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd start
```

`node scripts/verify-config.mjs` 可在未安装依赖时检查项目配置、文档、UTF-8 文件和本地导入路径；它不能替代 `tsc` 或 Next.js 构建。

当前不需要 `.env`、数据库或存储密钥。`.env.example` 中未来配置均为注释，**当前不会读取它们，也没有云存储实现**。

### 本轮验证限制（2026-10-28）

数据层测试 **10/10 通过**，通过 Node 内建测试运行器执行，不需要安装依赖。

依赖安装受到环境阻碍：联网安装的自动审批服务返回 404（审批模型 `codex-auto-review` 不可用）；普通安装路径返回 `ECONNREFUSED`。因此 **尚无 lockfile，Next.js 启动、ESLint、TypeScript 检查、生产构建与浏览器/WebGL 验收均未完成**。请先在可联网的环境安装依赖，生成并提交 `package-lock.json`，再执行上述命令。不要把已写完的实现当作已验收的成品。

## 本地数据与备份

- 当前使用 **浏览器 localStorage**，并非服务端磁盘、PostgreSQL 或云对象存储。
- 数据绑定浏览器、浏览器用户配置与站点 origin。`localhost`、`127.0.0.1` 和不同端口拥有不同数据，日常请固定访问地址。
- 数据未加密，没有账号和服务端访问控制，不应部署为正式私人记忆服务。请勿把本地版本作为重要资料的唯一副本。
- 清理站点数据、隐私模式结束、浏览器配额问题都可能导致本地记录不可用。
- 宇宙右上角「渲染与数据设置」→「导出完整本地档案」下载 JSON v1，含星球、星系和全部文字记忆。当前没有照片/视频上传，导出也不含媒体。
- 主数据键 `universe-of-me:data:v1`，上一版快照键 `universe-of-me:recovery:v1`，可选镜头键 `universe-of-me:camera:v1`。
- 损坏/未知版本数据会阻止写入并提供原始导出入口，不会静默重置。上一版快照目前仅为手动救援准备，尚无恢复/导入界面。
- 若需手动救援，请先分别备份主键和快照原文，再依据 schema 校验；不要直接清空存储。自动导入、迁移与恢复演练是后续任务。

## 项目结构

```text
src/
  app/                       # App Router、全局样式、错误与空页面
    planet/[id]/             # 独立星球档案
  components/
    three/                   # 材质、星空、镜头与 Canvas（不直接访问业务数据）
    universe/                # 探索界面与交互协调
    planets/                 # 星球创建与编辑表单
    memories/                # 结构化文字档案、记忆编辑器
    providers/               # 应用状态、持久化提交
    ui/                      # 对话框、按钮、存储状态
  domain/                    # 类型、日期与阶段规则
  data/                      # 本地仓库、校验与明确标记的示例
tests/                       # 日期、存储与保护措施的真实行为测试
docs/                        # 产品、架构、进度与技术决策
```

继续开发前请依次阅读 [AGENTS.md](AGENTS.md)、[产品规范](docs/PRODUCT.md)、[架构](docs/ARCHITECTURE.md)、[进度](docs/PROGRESS.md)、[技术决策](docs/DECISIONS.md)。
