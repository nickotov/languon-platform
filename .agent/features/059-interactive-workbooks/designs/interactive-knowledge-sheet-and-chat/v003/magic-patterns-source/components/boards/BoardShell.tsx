import React from 'react';

interface BoardShellProps {
  title: string;
  subtitle: string;
  /** Short note that this is a prototype board, not product UI. */
  badge?: React.ReactNode;
  nav?: { id: string; label: string }[];
  mobile: boolean;
  children: React.ReactNode;
}

/** Scrollable page for design boards reached from the Prototype panel. Not part of the product. */
export function BoardShell({ title, subtitle, badge, nav, mobile, children }: BoardShellProps) {
  return (
    <div className="h-full w-full overflow-y-auto bg-background-canvas text-text-primary">
      <div className={`mx-auto w-full max-w-[1320px] ${mobile ? 'px-4 py-6' : 'px-10 py-10'}`}>
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
            {badge}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{subtitle}</p>
          {nav && (
            <nav aria-label={`${title} sections`} className="mt-4 flex flex-wrap gap-1.5">
              {nav.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className="rounded-full border border-border-default bg-background-surface px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

export function BoardSection({ id, title, note, children }: { id?: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="mb-12 scroll-mt-6">
      <h2 id={id ? `${id}-h` : undefined} className="text-lg font-semibold text-text-primary">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-sm text-text-secondary">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BoardCard({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={`min-w-0 rounded-2xl border border-border-default bg-background-surface ${className}`}>
      <figcaption className="border-b border-border-default px-4 py-2 text-xs font-medium text-text-tertiary">{label}</figcaption>
      <div className="p-4">{children}</div>
    </figure>
  );
}

