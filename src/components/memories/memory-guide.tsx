"use client";

import { useState } from "react";
import { Compass, Image as ImageIcon, ListFilter, MessageCircle, Search, Shuffle, Sparkles, Video, X } from "lucide-react";

export type GuideAction = "recent" | "photo" | "video" | "date" | "keyword" | "random" | "all";

export function MemoryGuide({ count, onAction }: { count: number; onAction: (action: GuideAction) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [message, setMessage] = useState("欢迎回来。这里保存着这颗星球的记忆。");
  if (collapsed) return <button className="guide-reopen" aria-label="展开记忆引导者" onClick={() => setCollapsed(false)}><Sparkles size={15} />引导者</button>;
  const run = (action: GuideAction, text: string) => { setWelcomed(true); setMessage(text); onAction(action); };
  return <aside className="memory-guide" aria-label="记忆引导者"><button className="guide-close" aria-label="收起记忆引导者" onClick={() => setCollapsed(true)}><X size={14} /></button><div className="guide-avatar" aria-hidden="true"><div className="guide-halo" /><div className="guide-hair" /><div className="guide-face"><span className="guide-eye left" /><span className="guide-eye right" /><span className="guide-star">✦</span></div><div className="guide-collar" /></div><div className="guide-copy"><p className="eyebrow">MEMORY GUIDE</p><strong>星穹引导者</strong><p>{message}</p></div>{!welcomed ? <div className="guide-welcome-actions"><button className="button secondary" onClick={() => { setWelcomed(true); setMessage("你可以慢慢看，我就在这里。"); }}>自己探索<Compass size={14} /></button><button className="button" onClick={() => run("recent", count ? "我先把最近的时光带到你面前。" : "这里还没有保存的记忆。")}>让我帮你寻找<Search size={14} /></button></div> : <div className="guide-actions"><button onClick={() => run("recent", "这是最近保存的一段时光。")}><ListFilter size={13} />最近的记忆</button><button onClick={() => run("photo", "我找到了照片记忆。") }><ImageIcon size={13} />照片记忆</button><button onClick={() => run("video", "我找到了视频记忆。") }><Video size={13} />视频记忆</button><button onClick={() => run("date", "按年份筛选，看看那段时间留下了什么。") }><ListFilter size={13} />按日期筛选</button><button onClick={() => run("keyword", "告诉我一个关键词，我会在这颗星球里寻找。") }><MessageCircle size={13} />关键词搜索</button><button onClick={() => run("random", "交给一点偶然，打开一段记忆。") }><Shuffle size={13} />随机打开</button><button onClick={() => run("all", "所有记忆都在这里。") }><Compass size={13} />返回全部</button></div>}</aside>;
}
