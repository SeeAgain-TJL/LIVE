"use client";

import { useState } from "react";
import { Compass, Image as ImageIcon, ListFilter, Search, Shuffle, Sparkles, Video, X } from "lucide-react";

export type GuideAction = "recent" | "photo" | "video" | "date" | "keyword" | "random" | "all";

export function MemoryGuide({ onAction }: { onAction: (action: GuideAction) => string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("欢迎回来。这里保存着这颗星球的记忆。");
  const run = (action: GuideAction) => { setWelcomed(true); setMessage(onAction(action)); };
  if (collapsed) return <button className="guide-reopen" aria-label="展开记忆引导者" onClick={() => setCollapsed(false)}><Sparkles size={18} />记忆引导者</button>;
  return <aside className="memory-guide" aria-label="记忆引导者">
    <button className="icon-button guide-close" aria-label="收起记忆引导者" onClick={() => setCollapsed(true)}><X size={18} /></button>
    <div className="guide-avatar" aria-hidden="true"><div className="guide-halo" /><div className="guide-hair" /><div className="guide-face"><span className="guide-eye left" /><span className="guide-eye right" /><span className="guide-star">✦</span></div><div className="guide-collar" /></div>
    <div className="guide-copy"><strong>星穹引导者</strong><p aria-live="polite">{message}</p></div>
    {!welcomed ? <div className="guide-primary-actions">
      <button className="button secondary" onClick={() => { setWelcomed(true); setMessage("你可以慢慢看，我就在这里。"); }}><Compass size={16} />自己探索</button>
      <button className="button secondary" onClick={() => { setWelcomed(true); setExpanded(true); setMessage("想寻找哪一段时光？"); }}><Search size={16} />帮我寻找</button>
    </div> : <div className="guide-primary-actions">
      <button className="button secondary" onClick={() => run("recent")}><ListFilter size={16} />最近记忆</button>
      <button className="button secondary" aria-expanded={expanded} aria-controls="guide-search-actions" onClick={() => setExpanded(value => !value)}><Search size={16} />{expanded ? "收起查找" : "查找记忆"}</button>
    </div>}
    {expanded && <div className="guide-actions" id="guide-search-actions">
      <button onClick={() => run("photo")}><ImageIcon size={16} />照片记忆</button><button onClick={() => run("video")}><Video size={16} />视频记忆</button>
      <button onClick={() => run("date")}><ListFilter size={16} />按年份查找</button><button onClick={() => run("keyword")}><Search size={16} />关键词搜索</button>
      <button onClick={() => run("random")}><Shuffle size={16} />随机打开</button><button onClick={() => run("all")}><Compass size={16} />返回全部</button>
    </div>}
  </aside>;
}
