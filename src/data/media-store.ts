import type { UploadFile } from "../domain/types.ts";

export interface StoredMedia { id: string; blob: Blob }
const DB_NAME = "universe-of-me-media";
const STORE = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("当前浏览器不支持媒体本地存储。"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开媒体存储。"));
  });
}

export async function putMedia(id: string, file: UploadFile): Promise<void> {
  const db = await openDb();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("媒体保存失败。"));
  });
  db.close();
}

export async function getMedia(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => { db.close(); resolve((request.result as Blob | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error ?? new Error("媒体读取失败。")); };
  });
}

export async function deleteMedia(ids: string[]): Promise<void> {
  if (!ids.length || typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const id of ids) tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("媒体删除失败。"));
  });
  db.close();
}
