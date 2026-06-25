import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

function radiusTag(inRadius) {
  if (inRadius === true) return <span className="tag ok">in radius</span>;
  if (inRadius === false) return <span className="tag" style={{ background: '#f4d9d2', color: '#b3361f' }}>outside</span>;
  return <span className="tag">n/a</span>;
}

// A stored photo URL is a real image once R2 is wired (http...). Older records
// may still hold a 'pending-upload://' marker — show that as text, not an image.
function photo(url, label) {
  if (!url) return null;
  if (!/^https?:\/\//.test(url)) return <span className="muted" style={{ fontSize: 12 }}>📷 {label}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`Open ${label}`}>
      <img src={url} alt={label} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
    </a>
  );
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
      <p className="muted">Review promoter check-ins and verify the canopy activity. Tap a photo to view it full size.</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">No check-ins to review.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr><th>When</th><th>Promoter</th><th>Location</th><th>Shift</th><th>Territory</th><th>Map</th><th>Photos</th><th>Status</th><th></th></tr>
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
                  {a.gps_lat != null && a.gps_lng != null
                    ? <a href={`https://maps.google.com/?q=${a.gps_lat},${a.gps_lng}`} target="_blank" rel="noreferrer">View on map</a>
                    : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {photo(a.selfie_url, 'selfie') || '—'}
                    {photo(a.canopy_photo_url, 'canopy')}
                  </div>
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
