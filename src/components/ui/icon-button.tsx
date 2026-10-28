import type { ReactNode } from "react";

export function IconButton({ label, children, onClick, active = false, className = "" }: {
  label: string; children: ReactNode; onClick: () => void; active?: boolean; className?: string;
}) {
  return <button type="button" className={`icon-button ${active ? "active" : ""} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}
