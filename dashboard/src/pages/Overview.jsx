import { useState } from 'react';
import { api, downloadFile } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const today = () => new Date().toLocaleDateString('en-CA');
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA');

function ExportPanel() {
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const types = [['sales', 'Sales'], ['leads', 'Leads'], ['attendance', 'Attendance'], ['inventory', 'Inventory'], ['collections', 'Collections']];

  async function dl(type) {
    setBusy(type); setErr('');
    try {
      await downloadFile(`/api/reports/export/${type}?from=${from}&to=${to}`, `${type}_${from}_to_${to}.csv`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginTop: 16 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Download reports (CSV)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 13 }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 5, border: '1px solid var(--line)', borderRadius: 6 }} /></label>
        <label style={{ fontSize: 13 }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 5, border: '1px solid var(--line)', borderRadius: 6 }} /></label>
        {types.map(([t, label]) => (
          <button key={t} disabled={busy === t} onClick={() => dl(t)}>{busy === t ? '…' : `↓ ${label}`}</button>
        ))}
      </div>
      {err && <p className="error" style={{ marginBottom: 0 }}>{err}</p>}
    </div>
  );
}

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const inrK = (n) => (n >= 1000 ? '₹' + Math.round(n / 1000) + 'k' : '₹' + Math.round(n));

function Kpi({ label, value, sub, tone = 'plain' }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const { data, error, loading } = useAsync(() => api.get('/api/reports/overview'));
  if (loading) return <section><h2>Overview</h2><p className="muted">Loading…</p></section>;
  if (error) return <section><h2>Overview</h2><p className="error">{error}</p></section>;

  const k = data.kpis;
  const maxSale = Math.max(1, ...data.sales_7d.map((d) => d.total));
  const scopeLabel = data.scope === 'admin'
    ? 'Organisation-wide'
    : data.scope === 'supervisor'
      ? `Your team · ${data.promoters_in_scope} promoter(s)`
      : 'You';
  const f = data.funnel;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <section>
      <h2>Overview</h2>
      <p className="muted">{scopeLabel}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 12 }}>
        <Kpi label="Revenue · this month" value={inr(k.revenue_month)} sub={`${inr(k.revenue_today)} today`} tone="money" />
        <Kpi label="Units sold · month" value={k.units_month} tone="plain" />
        <Kpi label="Leads" value={k.leads_total} sub={`${k.leads_verified} verified · ${k.leads_converted} converted`} tone="accent" />
        <Kpi label="Conversion" value={`${k.conversion_rate}%`} tone="plain" />
        <Kpi label="Check-ins today" value={k.checkins_today} tone="brand" />
        <Kpi label="In-radius rate" value={`${k.in_radius_rate}%`} tone="plain" />
        <Kpi label="Points" value={k.points} tone="gold" />
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 13 }}>Sales — last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130, marginTop: 12 }}>
          {data.sales_7d.map((d) => (
            <div key={d.day} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div className="muted" style={{ fontSize: 11, height: 14 }}>{d.total ? inrK(d.total) : ''}</div>
              <div title={inr(d.total)} style={{ height: Math.max(2, Math.round((d.total / maxSale) * 95)), background: 'var(--brand)', borderRadius: 4, marginTop: 4 }} />
              <div style={{ fontSize: 11, marginTop: 4 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: data.leaderboard.length ? '1fr 1fr' : '1fr', gap: 12, marginTop: 16 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Lead funnel</div>
          {[['Captured', f.captured, 100], ['Verified', f.verified, pct(f.verified, f.captured)], ['Converted', f.converted, pct(f.converted, f.captured)]].map(([lbl, val, w], i) => (
            <div key={lbl} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>{lbl}</span><span style={{ fontWeight: 500 }}>{val}</span></div>
              <div style={{ height: 10, borderRadius: 6, width: `${Math.max(4, w)}%`, background: ['#5DCAA5', '#1D9E75', '#0F6E56'][i] }} />
            </div>
          ))}
        </div>

        {data.leaderboard.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Top promoters</div>
            {data.leaderboard.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{inrK(p.revenue)} · {p.points} pts</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ExportPanel />
    </section>
  );
}
