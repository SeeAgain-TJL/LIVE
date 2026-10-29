"use client";

import Image from "next/image";
import { useState } from "react";
import type { GuideState } from "@/domain/guide-companion";
import { MEMORY_GUIDE_ASSET, type CharacterAsset } from "./character-assets";
import { GuidePortrait } from "./guide-portrait";

const stateLabels: Record<GuideState, string> = { idle: "在你身旁", welcome: "欢迎回来", thinking: "正在寻找", speaking: "轻声交谈", guiding: "陪你出发", arrived: "已经抵达" };
export function GuideCharacter({ state, asset = MEMORY_GUIDE_ASSET }: { state: GuideState; asset?: CharacterAsset }) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = asset.states[state] ?? asset.source;
  const preview = !source || failed === source;
  return <span className="guide-character-art" data-character-state={state} data-asset-status={preview ? "preview" : asset.status}>
    <span className="guide-character-visual">{preview ? <GuidePortrait /> : <Image src={source} width={512} height={1024} alt={asset.alt} draggable={false} unoptimized onError={() => setFailed(source)} />}</span>
    <span className="guide-character-caption">{stateLabels[state]}</span>
    {(preview || asset.status === "preview") && <span className="guide-asset-preview">立绘开发预览</span>}
  </span>;
}
