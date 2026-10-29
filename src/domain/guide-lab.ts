export type ActorState = "idle" | "attention" | "thinking" | "pointing" | "guiding" | "arrived" | "summoning" | "presenting";
export interface ActorSnapshot {
  state: ActorState;
  ready: boolean;
  run: number;
  intent: "travel" | "summon" | "inspect" | null;
  planetId: string | null;
  memoryId: string | null;
}
export type ActorEvent =
  | { type: "MODEL_READY" | "MODEL_LOADING" | "CANCEL" }
  | { type: "TRAVEL"; planetId: string }
  | { type: "FIND_MEMORY"; memoryId: string; planetId: string }
  | { type: "INSPECT" | "WELCOME" }
  | { type: "GAZE_SETTLED" | "GESTURE_READY" | "CAMERA_ARRIVED" | "SEARCH_RESOLVED" | "ORB_IN_PALM" | "WELCOME_FINISHED"; run: number };

export const initialActor: ActorSnapshot = { state: "idle", ready: false, run: 0, intent: null, planetId: null, memoryId: null };
export const actorBusy = (s: ActorSnapshot) => !["idle", "presenting"].includes(s.state);

/** Navigation/rig/orb report completion events. A stale run cannot finish a newer action. */
export function reduceActor(s: ActorSnapshot, e: ActorEvent): ActorSnapshot {
  if (e.type === "MODEL_LOADING") return { ...initialActor, run: s.run + 1 };
  if (e.type === "MODEL_READY") return { ...s, ready: true };
  if (e.type === "CANCEL") return { ...s, state: "idle", intent: null, planetId: null, memoryId: null, run: s.run + 1 };
  if (!s.ready) return s;
  if ("run" in e && e.run !== s.run) return s;
  if (e.type === "TRAVEL" && e.planetId && !actorBusy(s)) return { ...s, run: s.run + 1, state: "attention", intent: "travel", planetId: e.planetId, memoryId: null };
  if (e.type === "FIND_MEMORY" && e.memoryId && e.planetId && !actorBusy(s)) return { ...s, run: s.run + 1, state: "thinking", intent: "summon", planetId: e.planetId, memoryId: e.memoryId };
  if (e.type === "INSPECT" && !actorBusy(s)) return { ...s, run: s.run + 1, state: "attention", intent: "inspect", memoryId: null };
  if (e.type === "WELCOME" && !actorBusy(s)) return { ...s, run: s.run + 1, state: "arrived", intent: null, memoryId: null };
  if (e.type === "GAZE_SETTLED" && s.state === "attention") return { ...s, state: s.intent === "travel" ? "pointing" : "idle" };
  if (e.type === "GESTURE_READY" && s.state === "pointing") return { ...s, state: "guiding" };
  if (e.type === "CAMERA_ARRIVED" && s.state === "guiding") return { ...s, state: "arrived" };
  if (e.type === "WELCOME_FINISHED" && s.state === "arrived") return { ...s, state: "idle", intent: null };
  if (e.type === "SEARCH_RESOLVED" && s.state === "thinking") return { ...s, state: "summoning" };
  if (e.type === "ORB_IN_PALM" && s.state === "summoning") return { ...s, state: "presenting" };
  return s;
}

export const actorLines: Record<ActorState, string> = {
  idle: "可以先观察人物，也可以选择一颗真实星球。",
  attention: "让我看看目标的位置。",
  thinking: "找到这段记忆了。",
  pointing: "目标在那里。",
  guiding: "我们出发吧。",
  arrived: "已经到了，欢迎回来。",
  summoning: "让这段时光慢慢靠近。",
  presenting: "这就是你保存的记忆。",
};

/** Strict, self-contained binary input; never fetch model/animation external resource URIs. */
export function inspectLabGlb(buffer: ArrayBuffer, kind: "model" | "animation"): Record<string, unknown> {
  if (buffer.byteLength > 35 * 1024 * 1024 || buffer.byteLength < 24) throw new Error("文件须为 35 MB 以内的自包含 GLB/VRM/VRMA。");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("不是有效的 GLB 2 二进制文件。");
  const size = view.getUint32(12, true);
  if (size > buffer.byteLength - 20) throw new Error("GLB JSON 区块不完整。");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, size)));
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !/^data:/i.test(resource.uri)) throw new Error("实验页仅接受自包含资产，不请求外部贴图或缓冲区。");
  }
  const extension = kind === "model" ? json.extensions?.VRMC_vrm : json.extensions?.VRMC_vrm_animation;
  if (extension?.specVersion !== "1.0") throw new Error(kind === "model" ? "需要 VRM 1.0 人形模型；不接受普通 GLB 或 VRM 0.x。" : "需要 VRM Animation 1.0（.vrma）。");
  return json;
}
