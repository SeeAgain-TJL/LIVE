"use client";
import { useEffect, useState } from "react";
import type { Media } from "@/domain/types";
import { getMedia } from "@/data/media-store";

export function MediaAttachment({ media }: { media: Media }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let active = true; getMedia(media.id).then(blob => { if (active && blob) setUrl(URL.createObjectURL(blob)); }).catch(() => undefined); return () => { active = false; setUrl(current => { if (current) URL.revokeObjectURL(current); return null; }); }; }, [media.id]);
  if (!url) return <span className="media-loading">正在读取媒体…</span>;
  return media.kind === "video" ? <video className="memory-media" controls preload="metadata" src={url} /> : <a href={url} target="_blank" rel="noreferrer">{/* Blob URLs cannot use next/image optimization. */}<img className="memory-media" src={url} alt={media.name} /></a>; // eslint-disable-line @next/next/no-img-element
}
