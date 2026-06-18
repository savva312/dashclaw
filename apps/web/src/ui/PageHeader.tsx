import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  aside,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="dc-page-header">
      <div className="dc-page-header-copy">
        <div className="dc-page-header-title-row">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="office-subtitle">{subtitle}</p> : null}
      </div>
      {aside ? <div className="dc-page-header-aside">{aside}</div> : null}
    </header>
  );
}
