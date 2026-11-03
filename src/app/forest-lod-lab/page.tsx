import { PineLodReview } from "@/components/forest-lab/pine-lod-review";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const species=typeof params.species==="string" && /^(pine_0[1-5]|silver_fir_0[1-6])$/.test(params.species) ? params.species:"pine_02";
  const level=typeof params.level==="string" && ["source","near","mid","far"].includes(params.level) ? params.level:"source";
  const view=typeof params.view==="string" && ["near","mid","far"].includes(params.view) ? params.view:"near";
  return <PineLodReview species={species} level={level} view={view} bake={params.bake==="1"} angle={Math.max(0,Math.min(7,Number(params.angle)||0))} />;
}
