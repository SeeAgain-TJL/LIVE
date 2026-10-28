import Link from "next/link";

export default function NotFound() {
  return <main className="storage-state"><p className="eyebrow">LOST IN SPACE / 404</p><h1>这里还没有留下星光</h1><p>这个页面不存在，回到宇宙继续探索吧。</p><Link className="button" href="/">返回我的宇宙</Link></main>;
}
