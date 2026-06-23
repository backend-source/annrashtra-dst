import { useState } from 'react';
import Overview from '../pages/Overview.jsx';
import RefillApprovals from '../pages/RefillApprovals.jsx';
import Leads from '../pages/Leads.jsx';
import Attendance from '../pages/Attendance.jsx';
import Products from '../pages/Products.jsx';
import Locations from '../pages/Locations.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', el: Overview },
  { id: 'refills', label: 'Refill Approvals', el: RefillApprovals },
  { id: 'attendance', label: 'Canopy Verification', el: Attendance },
  { id: 'leads', label: 'Leads', el: Leads },
  { id: 'locations', label: 'Locations', el: Locations },
  { id: 'products', label: 'Products & Pricing', el: Products },
];

export default function Layout({ user, onLogout }) {
  const [tab, setTab] = useState('overview');
  const Active = TABS.find((t) => t.id === tab).el;

  return (
    <div className="app">
      <header>
        <strong>Annrashtra DST</strong>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted">{user.name || user.role} · {user.role}</span>
        <button className="link" onClick={onLogout}>Log out</button>
      </header>
      <main>
        <Active user={user} />
      </main>
    </div>
  );
}
