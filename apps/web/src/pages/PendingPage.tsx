import type { NavItem } from '../routes/navigation';

export function PendingPage({ item }: { item: NavItem }) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>
          {item.label} <span className="badge">Planned</span>
        </h1>
      </header>
      <div className="card pending-card">
        <p>{item.description}</p>
        <p className="muted">
          Planned for milestone {item.milestone} · tracked as <code>{item.ticket}</code> in
          docs/planning/backlog.md.
        </p>
      </div>
    </section>
  );
}
