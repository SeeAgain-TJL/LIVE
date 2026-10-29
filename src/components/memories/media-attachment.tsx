"use client";
import { useEffect, useState } from "react";
import type { Media } from "@/domain/types";
import { getMedia } from "@/data/media-store";

export function MediaAttachment({ media }: { media: Media }) {
  const [attachment, setAttachment] = useState<{ id: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    getMedia(media.id).then(blob => {
      if (!active) return;
      if (!blob) { setAttachment({ id: media.id, error: "当前浏览器中没有找到这个媒体文件，请保留并核对原始副本。" }); return; }
      objectUrl = URL.createObjectURL(blob);
      setAttachment({ id: media.id, url: objectUrl });
    }).catch(() => { if (active) setAttachment({ id: media.id, error: "无法读取本地媒体，请稍后重新打开。" }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [media.id]);
  if (attachment?.id === media.id && attachment.error) return <p className="media-loading" role="status">{media.name}：{attachment.error}</p>;
  const url = attachment?.id === media.id ? attachment.url : undefined;
  if (!url) return <span className="media-loading">正在读取媒体…</span>;
  return media.kind === "video" ? <video className="memory-media" aria-label={media.name} controls preload="metadata" src={url} /> : <a href={url} target="_blank" rel="noreferrer" aria-label={`查看原图：${media.name}`}>{/* Blob URLs cannot use next/image optimization. */}<img className="memory-media" src={url} alt={media.name} /></a>; // eslint-disable-line @next/next/no-img-element
}
