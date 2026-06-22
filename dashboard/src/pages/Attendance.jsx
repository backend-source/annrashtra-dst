import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

function radiusTag(inRadius) {
  if (inRadius === true) return <span className="tag ok">in radius</span>;
  if (inRadius === false) return <span className="tag" style={{ background: '#f4d9d2', color: '#b3361f' }}>outside</span>;
  return <span className="tag">n/a</span>;
}

export default function Attendance() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/attendance'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  async function verify(id) {
    setBusy(id); setMsg('');
    try {
      await api.post(`/api/attendance/${id}/verify`, {});
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Canopy verification</h2>
      <p className="muted">Review promoter check-ins and verify the canopy activity. Photos show as captured; image thumbnails appear once Firebase Storage is wired.</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">No check-ins to review.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr><th>When</th><th>Promoter</th><th>Location</th><th>Shift</th><th>Territory</th><th>Photos</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.check_in_at).toLocaleString()}</td>
                <td>{a.promoter_name}</td>
                <td>{a.location_name || '—'}</td>
                <td>{a.shift}</td>
                <td>{radiusTag(a.in_radius)}</td>
                <td>
                  {a.selfie_url ? '📷 selfie' : '—'}{a.canopy_photo_url ? ' · 📷 canopy' : ''}
                </td>
                <td>
                  {a.verified_by
                    ? <span className="tag ok">verified</span>
                    : <span className="tag">pending</span>}
                </td>
                <td className="actions">
                  {!a.verified_by && (
                    <button disabled={busy === a.id} onClick={() => verify(a.id)}>Verify</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
