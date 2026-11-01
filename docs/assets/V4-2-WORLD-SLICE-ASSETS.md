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
- 当前浏览器资产总大小约 53 MiB（GLB、1K JPG 和 2K HDR），模型只在样板页面加载；已用 Git LFS，后续正式部署仍应使用 CDN，避免扩大普通 Git 历史。
- 这些是 CC0 环境资产，不是银蓝星灵角色资产，也不改变正式引导者和 VRM 实验室。

## V4.2-R1 浏览器 LOD

- `scripts/world-slice/build-lods.py` 在 Blender 4.2.23 中对上述已获 CC0 授权的 Island Tree 源 GLB 再次减面；没有引入新的第三方素材。
- 近景 `island_tree_01-lod1.glb` 约 10.49 MB、57,433 面；中远景 `island_tree_02-lod2.glb` 约 6.47 MB、7,927 面。原 V4.2 GLB 保留用于技术回溯，当前样板运行时只请求两个 LOD 文件。
- R1 实测 Chrome 资源列表中样板 HDR、扫描 GLB 和地表纹理压缩传输约 33 MB。浏览器仍解码 2K HDR 与多个 1K JPG，移动网络首访成本较高；后续正式部署应进一步制作 KTX2/压缩几何和 CDN 缓存。
- 近景树木的自动减面可以看到枝叶变稀；它是本轮的性能折中，并非最终精修植被。需要有授权的更多树种、灌木、海岸岩体和艺术指导下的手工 LOD 才能达到最终写实目标。
