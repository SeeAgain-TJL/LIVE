import type { ReactNode } from "react";

export function IconButton({ label, children, onClick, active = false, className = "", disabled = false }: {
  label: string; children: ReactNode; onClick: () => void; active?: boolean; className?: string; disabled?: boolean;
}) {
  return <button type="button" className={`icon-button ${active ? "active" : ""} ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}
