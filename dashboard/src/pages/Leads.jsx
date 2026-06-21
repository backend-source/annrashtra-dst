import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const VERIFIED = new Set(['whatsapp_confirmed', 'otp_verified']);

export default function Leads() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/leads'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  async function update(id, patch) {
    setBusy(id); setMsg('');
    try {
      await api.patch(`/api/leads/${id}/state`, patch);
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Leads</h2>
      <p className="muted">Verifying or converting a lead awards the promoter points (verified +10, converted +25).</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>Name</th><th>Mobile</th><th>Concern</th><th>Verify</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <td>{l.name || '—'}</td>
                <td className="mono">{l.mobile}</td>
                <td>{l.health_concern || '—'}</td>
                <td><span className={VERIFIED.has(l.verify_status) ? 'tag ok' : 'tag'}>{l.verify_status}</span></td>
                <td><span className="tag">{l.status}</span></td>
                <td className="actions">
                  {!VERIFIED.has(l.verify_status) && (
                    <button disabled={busy === l.id} onClick={() => update(l.id, { verify_status: 'whatsapp_confirmed' })}>Verify</button>
                  )}
                  {l.status !== 'converted' && (
                    <button disabled={busy === l.id} onClick={() => update(l.id, { status: 'converted' })}>Convert</button>
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
