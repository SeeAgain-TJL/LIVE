# V4.2 样板星球资产清单

本轮样板只启用 `PlanetAppearance.type = ocean` 的派生视觉层。它不会修改保存的 Planet、Memory 或媒体记录；没有真实记录时不会生成记忆对象。

## 来源与许可证

全部环境模型、PBR 纹理和 HDR 天空来自 [Poly Haven](https://polyhaven.com/)，其官方许可页面标注为 **CC0 1.0**（可商用、修改和再分发，无需署名，但保留来源记录）。下载 API、版本和 MD5 在 `scripts/world-slice/download-polyhaven.mjs` 中固定；源文件缓存放在 `%LOCALAPPDATA%\UNIVERSE-OF-ME\world-slice-source`，不提交仓库。

| 资产 | 用途 | 官方页面 | 浏览器文件 |
| --- | --- | --- | --- |
| Island Tree 01 / 02 | 近景与中景树木，Blender 4.2 合并减面后导出 | https://polyhaven.com/a/island_tree_01 · https://polyhaven.com/a/island_tree_02 | `public/world-slice/island_tree_01.glb`, `island_tree_02.glb` |
| Fern 02 | 海岸和林下近景 | https://polyhaven.com/a/fern_02 | `fern_02.glb` |
| Shrub 03 | 中景灌木 | https://polyhaven.com/a/shrub_03 | `shrub_03.glb` |
| Rock Moss Set 01 | 岩石和岸线前景 | https://polyhaven.com/a/rock_moss_set_01 | `rock_moss_set_01.glb` |
| Leafy Grass / Coast Sand 04 / Aerial Grass Rock | 地表 PBR albedo + normal | https://polyhaven.com/a/leafy_grass · https://polyhaven.com/a/coast_sand_04 · https://polyhaven.com/a/aerial_grass_rock | `public/world-slice/*_diff.jpg`, `*_normal.jpg` |
| Kloofendal 48d Partly Cloudy (Pure Sky) | 真实天空照明和背景 | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | `kloofendal_48d_partly_cloudy_puresky_2k.hdr` |

## 处理记录

- Blender 4.2.23 LTS 后台导入 1K glTF，并导出 GLB；树木按材质分离后分别减面，保留枝叶结构。网页端使用 R3F instancing，低档位减少实例数量。
- 资源总大小约 35 MiB（GLB、1K JPG 和 2K HDR），模型只在样板页面加载；后续正式部署应使用 CDN / Git LFS，避免扩大普通 Git 历史。
- 这些是 CC0 环境资产，不是银蓝星灵角色资产，也不改变正式引导者和 VRM 实验室。
