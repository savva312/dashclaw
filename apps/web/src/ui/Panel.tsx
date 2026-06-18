import type { HTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className = "",
  live = false,
  ...props
}: HTMLAttributes<HTMLElement> & { live?: boolean; children: ReactNode }) {
  return (
    <section className={`dc-panel ${live ? "dc-panel-live" : ""} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="dc-panel-header">
      <h3>{title}</h3>
      {aside ? <div className="dc-panel-aside">{aside}</div> : null}
    </div>
  );
}
