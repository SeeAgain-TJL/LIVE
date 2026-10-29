"use client";

import Link from "next/link";
import { EyeOff, X } from "lucide-react";
import { useGuide } from "./guide-provider";
import { PlanetExitLink } from "@/components/memories/planet-exit-link";
import type { Planet } from "@/domain/types";

export function GuideDialogue({ onClose, onSearch, activePlanet, parentHref }: {
  onClose: () => void; onSearch: (mode: "destinations" | "memories", recent?: boolean) => void; activePlanet: Planet | null; parentHref: string | null;
}) {
  const { message, say, updatePreferences, preferenceError, travelling, setPromptsEnabled, promptsEnabled } = useGuide();
  return <section className="companion-dialogue global-guide-dialogue" role="region" aria-label="引导者对话">
    <header><div><small>与你一起探索</small><strong>记忆引导者</strong></div><button className="guide-small-button" aria-label="收起记忆引导者" onClick={onClose}><X size={20} /></button></header>
    <p className="global-guide-message" aria-live="polite">{message}</p>
    <div className="companion-actions">
      <button onClick={() => onSearch("destinations")} disabled={travelling}>带我去看看</button>
      <button onClick={() => onSearch("memories")} disabled={travelling}>帮我寻找</button>
      <button onClick={() => onSearch("memories", true)} disabled={travelling}>最近记忆</button>
      <button disabled={travelling} onClick={() => { say("你可以慢慢看，我就在这里。", "idle"); onClose(); }}>自己探索</button>
      {!travelling && activePlanet ? <PlanetExitLink label="返回上一级" planetId={activePlanet.id} galaxyId={activePlanet.galaxyId!} /> : !travelling && parentHref ? <Link href={parentHref}>返回上一级</Link> : null}
    </div>
    <label className="guide-prompt-setting"><input type="checkbox" checked={promptsEnabled} onChange={e => setPromptsEnabled(e.target.checked)} />飞行与抵达时显示简短提示</label>
    <footer><span>可拖动人物，也可用方向键移动</span><button aria-label="隐藏记忆引导者" onClick={() => updatePreferences({ hidden: true, dialogueOpen: false })}><EyeOff size={16} />隐藏人物</button></footer>
    {preferenceError && <p className="guide-preference-error" role="status">{preferenceError}</p>}
  </section>;
}
