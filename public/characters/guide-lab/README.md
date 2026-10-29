# VRM 实验资产接口

本目录只供 `/guide-lab` 技术实验使用。现有正式 SVG 引导者没有被替换，也不继续以 CSS/贴图变化充当 3D 骨骼成果。

## 本轮提供的资产

- `pixiv-sample.vrm`：官方有授权的棕发技术样本，VRM 1.0 / glTF 2 binary。
- `pixiv-sample.meta.json`：来源固定提交、版权、内嵌许可、大小和散列。
- `LICENSE-MODEL.md`：使用边界。模型的许可与 three-vrm 软件包的 MIT 许可不同。

## 最终角色仍缺的交付物

1. **原创成年女性设计**：正侧背三视图、面部/手部特写、明确成年比例；银蓝长发、深蓝星空幻想服装，避免幼态和已有 IP。
2. **VRM 1.0 模型**：自包含 `.vrm`，T-pose、标准人形映射、正确骨骼轴；至少完整头颈/胸/肩臂/手指，LookAt、blink、relaxed 表情，头发/衣服 spring bones 与身体碰撞体。需要适合网页的 MToon 材质与合理贴图/面数。
3. **动作**：待机、转身、指向、欢迎、抬手与托球的授权 `.vrma`，或者动画师针对规范化骨架制作的关键帧。当前程序动作不能替代精修动作包。
4. **授权资料**：原创权属、使用/修改/再分发/商用范围、署名约定、源工程（`.vroid` 或 Blender）、贴图来源清单。不得提交来源不明的角色。
5. **标定**：模型高度、左手掌局部锚点、臂长与衣袖碰撞检查，以及桌面/手机性能报告。

制作路径：可自行用 VRoid Studio/Blender 制作原创人物，确认工具导出 VRM 1.0；或委托角色设计师、建模师和动画师按上述清单交付。最终模型须经过用户视觉审核后，才将 `status` 改为 `production-approved`。技术样本不会通过改发色被冒充为原创最终人物。

## 接入标准

`src/components/guide-lab/asset-contract.ts` 的 `LabActorAsset` 是入口：

```ts
{
  id: "unique-revision",
  label: "角色名 / 制作与审核状态",
  format: "VRM-1.0",
  status: "user-local", // 视觉与授权审核通过后才能 production-approved
  url: "/characters/.../guide.vrm",
  height: 1.7, // 场景世界单位，人物高度
  palmOffset: [0.055, 0.085, 0],
  provenance: "作者、权属与授权记录"
}
```

世界单位为米、Y 向上、VRM 1.0 正面为 +Z。初始人物高度归一到 1.7，脚底落地。动作写入 `getNormalizedBoneNode`，由 `vrm.update` 映射到原始骨架。掌心位置从 **raw leftHand 的实际世界位置**取得，再用 normalized leftHand 的世界旋转变换模型局部偏移，并应用模型缩放；它不是固定屏幕位置。当前偏移只标定了官方样本，换模型必须重新检查，不保证任意模型都无穿模。

本地导入限 35 MB、自包含 GLB、`VRMC_vrm.specVersion = 1.0`，要求核心骨骼、LookAt、blink；拒绝外部贴图/缓冲 URI。浏览器只读取选中的模型/动作文件，不上传，不持久化。加载、超时、解析、格式和 WebGL 失败均有界面提示，可恢复官方样本。

可选 `.vrma` 经 `VRMAnimationLoaderPlugin → createVRMAnimationClip → AnimationMixer` 播放；未包含的骨骼保持基础待机。按 Escape 结束。自动化用项目原创的三关键帧头部动作验证了解析与实际骨骼旋转；没有冒称已提供完整最终 VRMA 动作资产。
