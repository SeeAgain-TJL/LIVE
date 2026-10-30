"use client";
import type { TravelMode } from "@/domain/travel";
export function TravelModeSelect({ value, onChange, disabled = false }: { value: TravelMode; onChange: (mode: TravelMode) => void; disabled?: boolean }) {
  return <label className="travel-mode-control">旅行节奏<select aria-label="旅行节奏" value={value} disabled={disabled} onChange={e => onChange(e.target.value as TravelMode)}><option value="comfort">舒适 · 默认</option><option value="standard">标准</option><option value="fast">快速</option></select></label>;
}
