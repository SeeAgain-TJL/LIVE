import type { GuideState } from "./guide-companion.ts";

export const GUIDE_LINES = {
  universeWelcome: { text: "欢迎回来，今天想去哪里？", state: "welcome", busy: false },
  galaxyDeparture: { text: "我们先去那片星系看看吧。", state: "guiding", busy: true },
  galaxyArrived: { text: "已经到了。选一颗星球，看看里面的时光。", state: "arrived", busy: false },
  planetDeparture: { text: "找到它了，我们出发吧。", state: "guiding", busy: true },
  planetApproach: { text: "已经快到了。", state: "guiding", busy: true },
  planetArrived: { text: "已经到了，准备进入记忆殿堂。", state: "arrived", busy: true },
  memoryEntered: { text: "这些都是你曾经留下的时光。", state: "arrived", busy: false },
  travelCancelled: { text: "我们先留在这里。正在回到出发的位置。", state: "idle", busy: true },
  explorationReturning: { text: "我们回到星球外部，继续探索。", state: "guiding", busy: true },
  explorationReturned: { text: "又回到星球外部了，继续探索吧。", state: "idle", busy: false },
} as const satisfies Record<string, { text: string; state: GuideState; busy: boolean }>;
export type GuideCue = keyof typeof GUIDE_LINES;
