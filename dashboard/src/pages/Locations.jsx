import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const TYPES = ['park', 'gym', 'society', 'club'];
const blank = { name: '', area: '', type: 'park', lat: '', lng: '', radius_m: 120, assigned_to: '' };
const fld = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 };

export default function Locations({ user }) {
  const isAdmin = user?.role === 'admin';
  const locs = useAsync(() => api.get('/api/locations'));
  const promoters = useAsync(() => (isAdmin ? api.get('/api/users?role=promoter') : Promise.resolve([])));
  const [form, setForm] = useState(null); // null = closed; {} = new; {...} = editing
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);
  const [msg, setMsg] = useState('');

  async function remove(l) {
    if (!window.confirm(`Delete location "${l.name}"? This can't be undone.`)) return;
    setRowBusy(l.id); setMsg('');
    try {
      await api.del(`/api/locations/${l.id}`);
      locs.reload();
    } catch (e) { setMsg(e.message); } // e.g. "has activity — can't delete"
    finally { setRowBusy(null); }
  }

  function open(loc) {
    setMsg('');
    setForm(loc ? { ...blank, ...loc, lat: loc.lat ?? '', lng: loc.lng ?? '', assigned_to: loc.assigned_to ?? '' } : { ...blank });
  }

  async function save() {
    setBusy(true); setMsg('');
    const body = {
      name: form.name.trim(),
      area: form.area?.trim() || null,
      type: form.type,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      radius_m: Number(form.radius_m) || 120,
      assigned_to: form.assigned_to || null,
    };
    try {
      if (form.id) await api.patch(`/api/locations/${form.id}`, body);
      else await api.post('/api/locations', body);
      setForm(null);
      locs.reload();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <h2>Locations</h2>
      <p className="muted">
        {isAdmin ? 'Canopy spots. Set coordinates + radius and assign a promoter.' : 'Read-only — only an admin can manage locations.'}
      </p>
      {isAdmin && !form && <button onClick={() => open(null)}>+ Add location</button>}
      {msg && <p className="error">{msg}</p>}

      {form && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, margin: '12px 0', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <label style={fld}>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label style={fld}>Area<input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></label>
          <label style={fld}>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={fld}>Latitude<input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
          <label style={fld}>Longitude<input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
          <label style={fld}>Radius (m)<input type="number" min="1" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} /></label>
          <label style={fld}>Assigned promoter
            <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">— assign promoter —</option>
              {(promoters.data || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.mobile})</option>)}
            </select>
          </label>
          <div className="actions" style={{ gridColumn: '1 / -1' }}>
            <button onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="link" onClick={() => setForm(null)}>Cancel</button>
            {form.lat !== '' && form.lng !== '' && (
              <a href={`https://maps.google.com/?q=${form.lat},${form.lng}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>Preview on map</a>
            )}
          </div>
        </div>
      )}

      {locs.loading && <p className="muted">Loading…</p>}
      {locs.error && <p className="error">{locs.error}</p>}
      {locs.data && (
        <table>
          <thead><tr><th>Name</th><th>Area</th><th>Type</th><th>Coordinates</th><th>Radius</th><th>Assigned</th><th></th></tr></thead>
          <tbody>
            {locs.data.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.area || '—'}</td>
                <td>{l.type || '—'}</td>
                <td>
                  {l.lat != null && l.lng != null
                    ? <a href={`https://maps.google.com/?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">{Number(l.lat).toFixed(4)}, {Number(l.lng).toFixed(4)}</a>
                    : <span className="muted">not set</span>}
                </td>
                <td>{l.radius_m} m</td>
                <td>{l.assigned_name || '—'}</td>
                <td className="actions">
                  {isAdmin && <button onClick={() => open(l)}>Edit</button>}
                  {isAdmin && <button className="link" disabled={rowBusy === l.id} onClick={() => remove(l)} style={{ color: '#b3361f' }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
