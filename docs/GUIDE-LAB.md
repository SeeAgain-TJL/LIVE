# VRM 角色实验室 · 独立技术验证

本实验基于 V3.0-C `55a1c40`，分支 `codex/guide-vrm-lab`。不替换正式引导者，不升级档案 schema，不接 AI/语音，不增加星系功能。**动作技术验证与最终人物美术验收分开记录；当前不是最终角色交付。**

## 如何体验

```powershell
npm.cmd ci
npm.cmd run dev
```

打开 `http://127.0.0.1:3000/guide-lab`。使用日常相同的主机和端口，才能读取相同 origin 的档案；`localhost` 与 `127.0.0.1`、不同端口互不共享存储。实验路径没有首页自动入口，避免实验模型混入正式体验。

1. 等待「VRM 1.0 已就绪」。先观察全身模型、胸部呼吸、眨眼；「注视与转身」「欢迎动作」不依赖个人档案，可以独立验证。
2. **A/B**：选择当前档案的星球，点击「A → B」。观察身体/头眼对准目标 → 左臂抬起、食指指向星球 → 实际相机飞行 → 到达后转回用户、手掌向外欢迎 → 待机。
3. **C**：按关键词搜索并选择一条已保存记忆，点击「C」。人物注视那颗球、抬手，球沿弧线飞向真实左手骨锚点，托球后在下方阅读稳定文字。球随骨骼位置更新，正文不贴在球面。
4. 按 Escape 或「取消动作」返回待机，取消后的迟到镜头事件无效。可再次操作或把记忆球放回。
5. 「资产接口与诊断」显示当前浏览器 FPS、p95 帧时、draw calls、三角形、贴图、模型加载耗时和掌心误差；可导入自行取得授权的本地 VRM1 / VRMA，失败后可恢复官方样本。
6. 无档案时不会造经历、自动保存示例或创建媒体数据库；请在正式记忆页面保存后再回来验证 C。实验只展示所选一颗星球和一颗真实记忆球，不在 Canvas 加载全量媒体。

## 模型与 API 依据

| 项目 | 本轮实际使用 |
| --- | --- |
| 人物格式 | VRM 1.0，`VRMC_vrm` + spring bone / node constraint，glTF 2 binary |
| 来源 | pixiv 官方 `VRM1_Constraint_Twist_Sample v1.0.1`；许可/固定提交/散列见[资产授权](../public/characters/guide-lab/LICENSE-MODEL.md) |
| 软件 | `@pixiv/three-vrm` **3.5.5**、`@pixiv/three-vrm-animation` **3.5.5**；未升级 Three.js **0.180.0** / R3F 9 / Drei 10 |
| 兼容依据 | 两包 npm peer dependency 均为 `three >=0.137`；官方 README 的用法也使用 Three.js 0.180；本机已实际加载并运行动作 |
| 骨骼 | `VRMLoaderPlugin`、normalized humanoid bones、`AnimationMixer` 四元数轨道、双骨 IK、手指关节 |
| 表情与视线 | expressionManager blink/relaxed，LookAt.target + 限幅头骨朝向 |
| VRMA | `VRMAnimationLoaderPlugin`、`createVRMAnimationClip`，支持本地授权文件；用原创头转测试文件实际验证 |

核查参考（2026-10-29）：[three-vrm 官方](https://github.com/pixiv/three-vrm)、[官方 API](https://pixiv.github.io/three-vrm/docs/modules/three-vrm)、[VRM Animation](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-animation)、[VRM 1.0 规范](https://vrm.dev/en/vrm1/)。使用当前发布版和本地 `.d.ts` 实现，不依赖旧版 `getBoneNode` / `setPose` 等弃用 API。

## 事件与空间边界

```text
TRAVEL(planetId)
  attention --GAZE_SETTLED--> pointing --GESTURE_READY--> guiding
  guiding --CAMERA_ARRIVED(actual position)--> arrived --WELCOME_FINISHED--> idle

FIND_MEMORY(memoryId, planetId)
  thinking --SEARCH_RESOLVED--> summoning --ORB_IN_PALM(actual world position)--> presenting

CANCEL / MODEL_LOADING → invalidate run, stop pending sequence
```

`domain/guide-lab.ts` 是纯状态机；run ID 防止取消或换模型后过期完成事件触发新的导航。`rig-controller.ts` 管理真实骨骼关键帧、淡入淡出、头眼、双骨 IK 与手掌标定；`lab-scene.tsx` 负责三维目标、实际相机和球体位置及测量。台词只订阅动作状态，不驱动骨骼或假装完成动作。

呼吸以胸/脊椎骨旋转实现，眨眼走模型 morph expression。原始发丝/衣服 spring bones 由 `vrm.update` 更新。引导和抬手用规范化手臂骨骼求解，距离限制在实际臂长以内；球体飞行终点取自更新后的原始手骨。姿态间用 AnimationMixer cross-fade，朝向和到达位置平滑插值。减少动态效果下不循环呼吸/眨眼和 spring 模拟，缩短手势与镜头。

星球的 ID、名称、外观来自当前档案，记忆 ID、标题、正文、日期来自真实记录。为集中看清人物动作，**在实验世界重新摆放目标并缩小星球半径**，不改写 Planet.position 或 appearance。A/B 的导航是实验 Canvas 内的真实相机移动，**尚未接入正式 B2 路由旅行**；本轮先验证空间协调，不冒称正式引导者已升级。

## 存储隔离

根布局的 `ApplicationBoundary` 在 `/guide-lab` 不挂载 UniverseProvider/GuideProvider/GlobalGuide，避免正式 provider 的自动迁移和偏好保存。实验 `readLabArchive` 仅调用一次 `getItem` 和纯解析，兼容规范化只发生在内存；不调用 repository.load/save，不打开 IndexedDB，不存位置、模型或动作偏好。其余正式路由仍共享原来的 provider 实例与业务行为。

自动化在独立 Chrome 上下文、3100 生产端口放入明确标注的合成验收档案，并监听所有 Storage 写入和 IndexedDB open/delete；实验期间必须零调用，刷新后档案原文精确一致。截图中的记录是这些隔离测试数据，不含用户私人经历。

## 视觉限制与后续资产

官方样本为棕发、日常服装；不能视为银蓝长发、成年星空服装原创角色。当前没有最终设计图、精修模型和完整授权 VRMA 动作包，[资产清单和制作方案](../public/characters/guide-lab/README.md)列出交付契约。

程序化转身是在原地平滑旋转，没有脚步/重心动画；手势有机械感，肩腕与衣袖仍需要动画师精修。当前两骨 IK 不是全身碰撞系统，头发/衣物主要依赖样本自带碰撞体；不能保证任意换模或极端角度无穿模。待机与动作截图用于暴露这些问题，不能仅凭测试通过宣称「自然电影级」或最终视觉验收通过。

实验未做复杂后处理、实时布料、全身 IK 或正式页面集成；本地 VRM/VRMA 不上传。真实手机 GPU、长时间内存、不同授权模型的重定向和全角度穿模仍待专项验收。

## 实测与截图

本轮证据、基本性能与逐动作观察见 [GUIDE-LAB-REVIEW.md](GUIDE-LAB-REVIEW.md)。请以这些实际渲染截图和本机操作判断质感，静态测试只证明程序约束。
