"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useUniverse } from "@/components/providers/universe-provider";
import { useGuide } from "./guide-provider";
import { GuideCharacter } from "./guide-character";
import { GuideDialogue } from "./guide-dialogue";
import { GuideSearchPanel } from "./guide-search-panel";
import { useGuideFloating } from "./use-guide-floating";
import { useGuideNavigation } from "./use-guide-navigation";

export function GlobalGuide() {
  const { data, error } = useUniverse();
  const { binding, message, say, planetPreview, preferences, updatePreferences, preferencesReady, state, autoBubble, dismissBubble } = useGuide();
  const { travel, openMemory, activePlanet, parentHref } = useGuideNavigation(data);
  const [search, setSearch] = useState<{ mode: "destinations" | "memories"; recent: boolean } | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const reading = !!binding?.reading;
  const compact = preferences.hidden || reading || planetPreview;
  const { element, style, dragging, consumeDragClick, events } = useGuideFloating(preferences, updatePreferences, compact);
  const character = useRef<HTMLButtonElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const dialogueVisible = preferences.dialogueOpen && !preferences.hidden && ((!reading && !planetPreview) || forceOpen) && !search;
  const closePanel = () => { setSearch(null); setForceOpen(false); updatePreferences({ dialogueOpen: false }); dismissBubble(); character.current?.focus(); };
  useEffect(() => {
    if (dialogueVisible) panels.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [dialogueVisible]);
  // The guide remains a recovery affordance even when archive data is temporarily unavailable.
  if (!preferencesReady) return null;
  const open = () => {
    if (consumeDragClick()) return;
    if (!data || error) { updatePreferences({ hidden: false, dialogueOpen: false }); dismissBubble(); return; }
    if (reading || planetPreview) { setForceOpen(!dialogueVisible); updatePreferences({ dialogueOpen: !dialogueVisible }); }
    else if (preferences.hidden) updatePreferences({ hidden: false, dialogueOpen: true });
    else updatePreferences({ dialogueOpen: !preferences.dialogueOpen });
    setSearch(null); dismissBubble();
  };
  return <aside ref={element} style={style} className={`global-guide companion at-${preferences.edge} ${compact || !preferences.dialogueOpen ? "is-compact" : ""} ${reading ? "is-reading" : ""} ${dragging ? "is-dragging" : ""} ${preferences.hidden ? "is-hidden-guide" : ""}`} aria-label="全局记忆引导者" data-guide-instance="universe-companion" data-state={state} onKeyDown={event => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]") && (search || dialogueVisible)) { event.preventDefault(); event.stopPropagation(); closePanel(); }
  }}>
    <button ref={character} className="guide-character-button" aria-label={preferences.hidden ? "显示记忆引导者" : "展开记忆引导者"} aria-describedby="guide-movement-help" aria-expanded={dialogueVisible || !!search} onClick={open} {...events}>
      {preferences.hidden ? <><Sparkles size={22} /><span>显示引导者</span></> : <><GuideCharacter state={state} /><span className="guide-character-hint">{compact ? "记忆引导者" : "点击交谈 · 拖动移动"}</span></>}
    </button>
    {!preferences.hidden && !reading && !planetPreview && !dialogueVisible && !search && autoBubble && !dragging && <div className="companion-bubble"><p className="global-guide-message" aria-live="polite">{message}</p><button aria-label="关闭角色提示" onClick={dismissBubble}><X size={16} /></button></div>}
    <div ref={panels} className="companion-panels">
      {dialogueVisible && data && <GuideDialogue onClose={closePanel} activePlanet={activePlanet} parentHref={parentHref} onSearch={(mode, recent = false) => { say(mode === "memories" ? "我会在你保存的时光中寻找。" : "想去哪里？我们慢慢找。", "thinking"); setSearch({ mode, recent }); }} />}
      {search && data && !preferences.hidden && <GuideSearchPanel data={data} initialMode={search.mode} recent={search.recent} onActionComplete={() => { setSearch(null); setForceOpen(false); updatePreferences({ dialogueOpen: false }); }} onClose={() => { setSearch(null); updatePreferences({ dialogueOpen: true }); character.current?.focus(); }} onTravel={target => { if (travel(target)) { setSearch(null); updatePreferences({ dialogueOpen: false }); } }} onOpenMemory={id => { if (openMemory(id)) { setSearch(null); updatePreferences({ dialogueOpen: false }); } }} />}
    </div>
    <span id="guide-movement-help" className="sr-only">点击交谈；鼠标或触屏拖动，松开吸附边缘；方向键移动。</span>
  </aside>;
}
