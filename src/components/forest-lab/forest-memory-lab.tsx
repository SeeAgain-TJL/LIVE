"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Compass, Film, Image as ImageIcon, Leaf, Settings2, X } from "lucide-react";
import { readLabArchive } from "@/data/guide-lab-reader";
import { DATA_KEY } from "@/data/local-repository";
import { getMedia } from "@/data/media-store";
import { isPersonalPlanet, planetName } from "@/domain/planet";
import type { Media, Memory, UniverseData } from "@/domain/types";
import { useReducedMotion } from "@/components/three/use-render-preferences";
import { ForestRuntimeLab } from "./forest-runtime-lab";
import type { MemoryPhase, MemorySignal } from "./pine-memory-scene";

const EMPTY: Memory[]=[];
const PAGE_SIZE=12;
function ForestMedia({ media, closing }: { media:Media; closing:boolean }) {
  const [attachment,setAttachment]=useState<{url?:string;error?:string}>({});
  const [attempt,setAttempt]=useState(0), [expanded,setExpanded]=useState(false);
  const video=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    let active=true,url:string|undefined;
    getMedia(media.id).then(blob=>{
      if(!active)return;
      if(!blob){setAttachment({error:"这个附件未保存在当前浏览器。请核对原始媒体副本。"});return;}
      url=URL.createObjectURL(blob);setAttachment({url});
    }).catch(()=>{if(active)setAttachment({error:"暂时无法读取本地媒体。"});});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[media.id,attempt]);
  useEffect(()=>{if(closing)video.current?.pause();},[closing]);
  if(attachment.error)return <div className="fm-media-error" role="status"><p>{attachment.error}</p><button onClick={()=>{setAttachment({});setAttempt(n=>n+1);}}>重新读取</button></div>;
  if(!attachment.url)return <div className="fm-media-loading" role="status">正在读取原始媒体…</div>;
  return <div className={`fm-media-frame${expanded ? " expanded":""}`}>
    {media.kind==="video" ? <video ref={video} aria-label={media.name} src={attachment.url} controls playsInline preload="metadata" onError={()=>setAttachment({error:"浏览器无法解码这个视频。原文件仍保留。"})}/>:
      <button className="fm-photo" aria-label={expanded ? "缩回照片":"放大照片"} onClick={()=>setExpanded(v=>!v)}>
        {/* Local Blob URLs are read without uploading or image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={media.name} onError={()=>setAttachment({error:"浏览器无法解码这张照片。原文件仍保留。"})}/><span>{expanded ? "−":"+"}</span>
      </button>}
  </div>;
}

function Reading({ memory, media, worldName, closing, index, onClose }: {memory:Memory;media:Media[];worldName:string;closing:boolean;index:number;onClose():void}) {
  const dialog=useRef<HTMLDialogElement>(null),[slide,setSlide]=useState(0);
  const attachments=(memory.mediaIds??[]).map(id=>media.find(item=>item.id===id && item.memoryId===memory.id));
  const current=attachments[slide];
  useEffect(()=>{const d=dialog.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={dialog} className="fm-reader" data-closing={closing} aria-labelledby="fm-memory-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="fm-reading-context" aria-hidden="true"><span className="fm-fine-line"/><span>FOREST / MEMORY</span><span>{String(index+1).padStart(2,"0")}</span></div>
    <article className="fm-reading-page">
      <header className="fm-reading-top"><span><Leaf size={13}/>{worldName}</span><button className="fm-icon" onClick={onClose} aria-label="关闭记忆并返回森林" autoFocus><X size={20}/></button></header>
      <div className="fm-page-scroll">
        <div className="fm-date"><span>RECOLLECTION</span><time dateTime={memory.occurredOn}>{memory.occurredOn.replaceAll("-"," / ")}</time></div>
        <h2 id="fm-memory-title">{memory.title || "未命名记忆"}</h2>
        <div className="fm-title-rule"/>
        {attachments.length>0 && <section className="fm-gallery" aria-label="记忆中的照片与视频">
          <div className="fm-gallery-head"><span>{current?.kind==="video" ? <Film size={13}/>:<ImageIcon size={13}/>} {current?.kind==="video" ? "影像":"照片"}</span><span>{String(slide+1).padStart(2,"0")} / {String(attachments.length).padStart(2,"0")}</span></div>
          {current ? <ForestMedia key={current.id} media={current} closing={closing}/>:<p className="fm-media-error">这个附件的元数据不完整。原始档案未修改。</p>}
          <div className="fm-gallery-footer"><span>{current?.name??"附件不可用"}</span><div><button className="fm-icon" aria-label="上一个附件" disabled={slide===0} onClick={()=>setSlide(n=>n-1)}><ChevronLeft size={17}/></button><button className="fm-icon" aria-label="下一个附件" disabled={slide>=attachments.length-1} onClick={()=>setSlide(n=>n+1)}><ChevronRight size={17}/></button></div></div>
        </section>}
        {memory.body && <div className="fm-prose">{memory.body.split(/\n\s*\n/).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>}
        <footer className="fm-reading-footer"><span className="fm-fine-line"/><Leaf size={14}/><span className="fm-fine-line"/></footer>
        <button className="fm-return-walk" onClick={onClose}><ArrowLeft size={15}/> 收起记忆，继续走走</button>
      </div>
    </article>
  </dialog>;
}

export function ForestMemoryLab() {
  const [archive,setArchive]=useState<{data:UniverseData|null;ready:boolean;error:string}>({data:null,ready:false,error:""});
  const [planetId,setPlanetId]=useState(()=>typeof window==="undefined" ? "":new URLSearchParams(location.search).get("planet")??"");
  const [entered,setEntered]=useState(false),[forestReady,setForestReady]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null),[phase,setPhase]=useState<MemoryPhase>("exploring");
  const [signal,setSignal]=useState<MemorySignal>(null),[journal,setJournal]=useState(false),[settings,setSettings]=useState(false),[page,setPage]=useState(0);
  const [search,setSearch]=useState(""),[readingFromList,setReadingFromList]=useState(false),[tracked,setTracked]=useState<string|null>(null);
  const journalRef=useRef<HTMLDialogElement>(null),settingsRef=useRef<HTMLDialogElement>(null),shell=useRef<HTMLDivElement>(null);
  const reduced=useReducedMotion();
  useEffect(()=>{
    const read=()=>{try{setArchive({data:readLabArchive(localStorage),ready:true,error:""});}catch(e){setArchive({data:null,ready:true,error:String(e)});}};
    const sync=(e:StorageEvent)=>{if(e.key===DATA_KEY||e.key===null)read();};
    queueMicrotask(read);
    window.addEventListener("storage",sync);window.addEventListener("focus",read);
    return()=>{window.removeEventListener("storage",sync);window.removeEventListener("focus",read);};
  },[]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{const canvas=shell.current?.querySelector("canvas");setForestReady(canvas?.dataset.forestOriginReady==="true");},350);
    return()=>clearInterval(timer);
  },[]);
  const {data,ready,error}=archive;
  const planets=useMemo(()=>(data?.planets??[]).filter(p=>isPersonalPlanet(p,data?.memories??[])),[data]);
  const planet=planets.find(p=>p.id===planetId)??planets[0];
  const memories=useMemo(()=>(data?.memories??EMPTY).filter(m=>m.planetId===planet?.id).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||a.id.localeCompare(b.id)),[data,planet?.id]);
  const batches=Math.max(1,Math.ceil(memories.length/PAGE_SIZE));
  const batch=useMemo(()=>memories.slice(Math.min(page,batches-1)*PAGE_SIZE,(Math.min(page,batches-1)+1)*PAGE_SIZE),[memories,page,batches]);
  const reading=memories.find(m=>m.id===selectedId);
  const nearest=memories.find(m=>m.id===signal?.id);
  const returnFocus=useCallback(()=>requestAnimationFrame(()=>shell.current?.querySelector<HTMLCanvasElement>("canvas")?.focus({preventScroll:true})),[]);
  const onOpen=useCallback((id:string)=>{setSelectedId(id);setReadingFromList(false);setPhase("focusing");},[]);
  const onFocused=useCallback(()=>setPhase(p=>p==="focusing" ? "reading":p),[]);
  const onReturned=useCallback(()=>{setPhase("exploring");setSelectedId(null);returnFocus();},[returnFocus]);
  const closeReading=useCallback(()=>{
    if(readingFromList){setSelectedId(null);setPhase("exploring");setReadingFromList(false);returnFocus();}
    else setPhase("returning");
  },[readingFromList,returnFocus]);
  useEffect(()=>{if(journal)journalRef.current?.showModal();else journalRef.current?.close();},[journal]);
  useEffect(()=>{if(settings)settingsRef.current?.showModal();else settingsRef.current?.close();},[settings]);
  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape" && phase==="focusing"){e.preventDefault();setPhase("returning");}};
    window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);
  },[phase]);
  const label=planet ? planetName(planet):"未命名草稿";
  const resetWorld=(id:string)=>{setPlanetId(id);setPage(0);setSelectedId(null);setPhase("exploring");setSignal(null);setTracked(null);};

  return <div ref={shell} className="forest-memory-page" data-entered={entered} data-phase={phase} data-settings={settings}>
    {ready && !error && <ForestRuntimeLab memories={batch} experience={{selectedId,phase:readingFromList ? "exploring":phase,reduced,enabled:entered&&!journal&&!settings&&!readingFromList,onOpen,onSignal:setSignal,onFocused,onReturned}}/>}
    <div className="fm-edge-shade" aria-hidden="true"/>
    {!entered ? <section className="fm-arrival" aria-label="进入森林">
      <div className="fm-arrival-copy"><p className="fm-kicker"><span/> UNIVERSE OF ME <span/></p><span className="fm-chapter">PINE FOREST / MEMORY STUDY</span><h1>让记忆<br/><em>在林间停留。</em></h1><p className="fm-arrival-caption">沿着微光，重访你留下的时刻。</p>
        {!ready ? <p role="status">正在读取本地档案…</p>:error ? <p role="alert">{error} 原始档案未修改。</p>:<>
          {planets.length>0 ? <label className="fm-planet-picker"><span>这一次，走进</span><select aria-label="记忆所属星球" value={planet?.id??""} onChange={e=>resetWorld(e.target.value)}>{planets.map(p=><option key={p.id} value={p.id}>{planetName(p)}</option>)}</select><small>{memories.length} 段记忆 · 当前浏览器档案</small></label>:<p className="fm-no-archive">当前地址还没有个人星球。你仍可探索森林；这里不会添加示例经历。</p>}
          <button className="fm-enter" disabled={!forestReady} onClick={()=>{setEntered(true);returnFocus();}}><span>{forestReady ? "走进森林":"正在展开森林…"}</span><ArrowRight size={19}/></button>
        </>}
        <Link href={planet ? `/planet/${encodeURIComponent(planet.id)}`:"/"} className="fm-arrival-back">返回我的档案</Link>
      </div><footer className="fm-arrival-bottom"><span>01 <i/> 林间记忆</span><span>独立体验入口 · 本地只读</span></footer>
    </section>:<>
      <header className="fm-hud" inert={phase!=="exploring"}><Link href={planet ? `/planet/${encodeURIComponent(planet.id)}`:"/"} className="fm-exit"><ArrowLeft size={16}/><span>退出森林</span></Link><div className="fm-world-name"><span>PINE FOREST</span><strong>{planet ? label:"林间漫游"}</strong></div><nav><button className="fm-icon" aria-label="打开记忆目录" onClick={()=>setJournal(true)}><BookOpen size={18}/></button><button className="fm-icon" aria-label="探索设置" onClick={()=>setSettings(true)}><Settings2 size={18}/></button></nav></header>
      {phase==="exploring" && !journal && !settings && <>
        <div className="fm-reticle" aria-hidden="true" data-near={signal?.available??false}/>
        {signal && nearest && <div className="fm-discovery" data-close={signal.distance<9}>
          <div className="fm-bearing" aria-hidden="true" style={{transform:`rotate(${-signal.bearing}rad)`}}><span/></div>
          <span className="fm-discovery-distance">{Math.round(signal.distance)} m</span>
          {signal.distance<9 && <><span className="fm-discovery-date">{nearest.occurredOn.replaceAll("-"," . ")}</span><h2>{nearest.title||"未命名记忆"}</h2><button className="fm-unseal" disabled={!signal.available} onClick={()=>onOpen(nearest.id)}><kbd>E</kbd>{signal.available ? "轻轻打开":"走近，注视这段记忆"}</button></>}
        </div>}
        {tracked && <div className="fm-tracking"><Compass size={13}/><span>{memories.find(m=>m.id===tracked)?.title||"未命名记忆"}</span><button aria-label="取消寻找" onClick={()=>setTracked(null)}><X size={12}/></button></div>}
        {!memories.length && <div className="fm-empty-note">这片林间尚未安放记忆。慢慢走，也很好。</div>}
        <div className="fm-walk-note"><span>W A S D</span> 行走 <i/> 拖动转向 <i/> <span>E</span> 打开微光</div>
      </>}
    </>}
    <dialog ref={journalRef} className="fm-journal" aria-labelledby="fm-journal-title" onCancel={e=>{e.preventDefault();setJournal(false);returnFocus();}}>
      <header><div><p className="fm-kicker">MEMORY INDEX</p><h2 id="fm-journal-title">林间的时刻</h2></div><button className="fm-icon" aria-label="关闭记忆目录" onClick={()=>{setJournal(false);returnFocus();}}><X size={20}/></button></header>
      <p className="fm-journal-sub">{label} · {memories.length} 段已保存记忆</p><input aria-label="查找记忆" placeholder="查找标题、日期或文字" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="fm-journal-list">{memories.filter(m=>`${m.title} ${m.body} ${m.occurredOn}`.includes(search)).map(m=><article key={m.id}><time>{m.occurredOn}</time><h3>{m.title||"未命名记忆"}</h3><div><button onClick={()=>{setTracked(m.id);setPage(Math.floor(memories.indexOf(m)/PAGE_SIZE));setJournal(false);returnFocus();}}>在林中寻找 <Compass size={13}/></button><button onClick={()=>{setJournal(false);setSelectedId(m.id);setReadingFromList(true);setPhase("reading");}}>安静阅读 <BookOpen size={13}/></button></div></article>)}{!memories.length&&<p>当前星球尚未保存记忆。环境可以继续探索。</p>}</div>
      {batches>1&&<footer><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>上一组</button><span>林间展示 {Math.min(page,batches-1)+1} / {batches}</span><button disabled={page>=batches-1} onClick={()=>setPage(n=>n+1)}>下一组</button></footer>}
    </dialog>
    <dialog ref={settingsRef} className="fm-settings" aria-labelledby="fm-settings-title" onCancel={e=>{e.preventDefault();setSettings(false);returnFocus();}}>
      <header><h2 id="fm-settings-title">探索与画质</h2><button className="fm-icon" aria-label="关闭探索设置" onClick={()=>{setSettings(false);returnFocus();}}><X size={20}/></button></header><p>在画面上拖动观察，用 WASD 行走。靠近微光并注视它，按 E 或轻点实体打开记忆。Escape 收起记忆，回到刚才的视角。</p><p>系统减少动态效果偏好：{reduced?"已启用":"未启用"}。画质沿用原森林档位。</p><div id="fm-quality-slot"/><p className="fm-storage-note">只读当前访问地址的真实档案；照片和视频从本地 IndexedDB 读取。尚无账号、加密或云同步。另一地址或浏览器不会自动拥有这些媒体。</p>
    </dialog>
    {reading && (phase==="reading"||phase==="returning") && <Reading key={reading.id} memory={reading} media={data?.media??[]} worldName={label} index={memories.indexOf(reading)} closing={phase==="returning"} onClose={closeReading}/>}
  </div>;
}
