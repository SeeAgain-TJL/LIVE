# Pine Forest · 集中美术资产

以原 Blender 的既有转换成果为输入，不重导出地形、河流、废墟或分区。烘焙读取全部 60 个源分区，保留 585 个原树位，分别累积 653,902 条苔藓、17,797 条林下植被与 156,104 条针叶/碎枝覆盖记录。地表使用一张三通道散布图，苔藓颜色分布取自原 Blender 纹理。其余源实例仍由现有运行时处理。

对 8 种乔木合成相邻源视角的背层枝叶，保留原图集角度、画幅、树干和摆放。松树 `pine_04` 也处理现有高档图集。不把背层当作新增树或真实逐枝几何。源地块外新增连续基底和 951 张源轮廓延续卡片，站位由源林缘映射，属于视觉补景。

发布包只包含新覆盖目录 `visual-finish/`，与既有 Release 叠加。使用原场景纹理目录再生产：

```powershell
node scripts/forest-lab/build-pine-visual-finish.mjs "$env:LOCALAPPDATA/UNIVERSE-OF-ME/asset-audit/candidate-assets/textures"
```

[逐文件清单](runtime-assets.json)记录运行时文件的 SHA-256。原始 Blender 和先前运行包维持其已有恢复路径。
