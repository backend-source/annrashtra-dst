import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Collections() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/collections'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  async function confirm(id) {
    setBusy(id); setMsg('');
    try {
      await api.post(`/api/collections/${id}/confirm`, {});
      reload();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Cash collections</h2>
      <p className="muted">Promoters hand over the day's cash; verify the amount against expected cash sales, then confirm receipt.</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">No handovers yet.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr><th>Day</th><th>Promoter</th><th>Expected cash</th><th>Handed over</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const mismatch = Number(c.handed_over ?? c.amount) !== Number(c.expected_cash);
              return (
                <tr key={c.id}>
                  <td>{c.day}</td>
                  <td>{c.promoter_name}</td>
                  <td>{inr(c.expected_cash)}</td>
                  <td style={mismatch ? { color: 'var(--danger)' } : undefined}>{inr(c.amount)}</td>
                  <td>{c.status === 'received'
                    ? <span className="tag ok">received{c.confirmed_by_name ? ` · ${c.confirmed_by_name}` : ''}</span>
                    : <span className="tag">pending</span>}</td>
                  <td className="actions">
                    {c.status !== 'received' && (
                      <button disabled={busy === c.id} onClick={() => confirm(c.id)}>Confirm received</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
