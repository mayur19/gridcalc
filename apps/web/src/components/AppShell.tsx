import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { NAV_ITEMS } from '../routes/navigation';

export function AppShell() {
  const { session, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ▦
          </span>{' '}
          gridcalc
        </div>
        <nav>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  <span>{item.label}</span>
                  {item.status === 'planned' && <span className="badge">Planned</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <div className="who">
            <strong>{session?.user.displayName}</strong>
            <span>
              {session?.organization.name} · {session?.role}
            </span>
          </div>
          <button type="button" className="button ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
