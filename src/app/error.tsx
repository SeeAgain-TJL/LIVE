"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="storage-state"><p className="eyebrow">SIGNAL INTERRUPTED</p><h1>暂时失去了信号</h1><p>页面载入遇到了问题，你的本地档案不会因此被重置。</p><button className="button" onClick={reset}>重新连接</button></main>;
}
