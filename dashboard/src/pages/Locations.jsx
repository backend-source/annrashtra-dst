import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

function mapLink(l) {
  if (l.lat == null || l.lng == null) return <span className="muted">no GPS</span>;
  return <a href={`https://maps.google.com/?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">{Number(l.lat).toFixed(4)}, {Number(l.lng).toFixed(4)}</a>;
}

export default function Locations({ user }) {
  const isAdmin = user?.role === 'admin';
  const locs = useAsync(() => api.get('/api/locations'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const all = locs.data || [];
  const pending = all.filter((l) => l.status === 'pending');
  const active = all.filter((l) => l.status !== 'pending');

  async function act(id, fn) {
    setBusy(id); setMsg('');
    try { await fn(); locs.reload(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  const confirm = (l) => act(l.id, () => api.post(`/api/locations/${l.id}/confirm`, {}));
  const reject = (l) => { if (window.confirm(`Reject "${l.name}" (${l.assigned_name})?`)) act(l.id, () => api.post(`/api/locations/${l.id}/reject`, {})); };
  const del = (l) => { if (window.confirm(`Delete "${l.name}"? This can't be undone.`)) act(l.id, () => api.del(`/api/locations/${l.id}`)); };

  return (
    <section>
      <h2>Locations (canopy spots)</h2>
      <p className="muted">
        Promoters set their spot from their phone (current GPS) — a 150 m geofence is built around it.
        Confirm a spot to make it active so the promoter can check in there.
      </p>
      {msg && <p className="error">{msg}</p>}
      {locs.loading && <p className="muted">Loading…</p>}
      {locs.error && <p className="error">{locs.error}</p>}

      {pending.length > 0 && (
        <>
          <h3 style={{ color: '#b3361f' }}>⚠ Awaiting confirmation ({pending.length})</h3>
          <table>
            <thead><tr><th>Spot</th><th>Promoter</th><th>Location</th><th>Radius</th><th>Action</th></tr></thead>
            <tbody>
              {pending.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}{l.area ? <div className="muted" style={{ fontSize: 12 }}>{l.area}</div> : null}</td>
                  <td>{l.assigned_name || l.created_by_name || '—'}</td>
                  <td>{mapLink(l)}</td>
                  <td>{l.radius_m} m</td>
                  <td className="actions">
                    <button disabled={busy === l.id} onClick={() => confirm(l)}>Confirm</button>
                    <button className="link" disabled={busy === l.id} onClick={() => reject(l)} style={{ color: '#b3361f' }}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Active spots ({active.length})</h3>
      {active.length === 0 && <p className="muted">No confirmed spots yet.</p>}
      {active.length > 0 && (
        <table>
          <thead><tr><th>Spot</th><th>Promoter</th><th>Location</th><th>Radius</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {active.map((l) => (
              <tr key={l.id}>
                <td>{l.name}{l.area ? <div className="muted" style={{ fontSize: 12 }}>{l.area}</div> : null}</td>
                <td>{l.assigned_name || '—'}</td>
                <td>{mapLink(l)}</td>
                <td>{l.radius_m} m</td>
                {isAdmin && <td className="actions"><button className="link" disabled={busy === l.id} onClick={() => del(l)} style={{ color: '#b3361f' }}>Delete</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
