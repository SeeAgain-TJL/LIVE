"use client";

import { Download, Orbit, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useUniverse } from "@/components/providers/universe-provider";

export function StorageState() {
  const { error, ready, exportData } = useUniverse();
  const [notice, setNotice] = useState("");
  return <main className="storage-state"><Orbit size={36} className={ready ? "" : "slow-spin"} /><p className="eyebrow">UNIVERSE OF ME</p><h1>{ready ? "档案需要你的关注" : "正在展开你的宇宙"}</h1><p>{error || "让每一段人生，都有自己的引力。"}</p>{ready && <><div className="button-row"><button className="button" onClick={() => location.reload()}><RefreshCw size={15} />重新载入</button><button className="button secondary" onClick={() => { try { exportData(true); } catch (e) { setNotice((e as Error).message); } }}><Download size={15} />导出原始数据</button></div>{notice && <p role="alert">{notice}</p>}<small>为保护已有记录，系统不会自动重置或覆盖无法读取的数据。</small></>}</main>;
}
