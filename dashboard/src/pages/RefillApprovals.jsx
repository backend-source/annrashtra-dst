import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

export default function RefillApprovals({ user }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/inventory/refill-requests?status=pending'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'admin';

  async function decide(id, action) {
    setBusy(id); setMsg('');
    try {
      await api.post(`/api/inventory/refill-requests/${id}/${action}`, action === 'reject' ? { note: 'rejected from dashboard' } : {});
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Pending refill requests</h2>
      <p className="muted">{isAdmin
        ? 'Approve or reject. After approval, the promoter confirms the actual quantity delivered, which adds the stock.'
        : 'Read-only — only an admin can approve or reject refill requests.'}</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">No pending requests.</p>}
      {data && data.length > 0 && (
        <table>
          <thead><tr><th>Requested</th><th>Promoter</th><th>Product</th><th>Qty</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.requested_at).toLocaleString()}</td>
                <td className="mono">{r.promoter_id.slice(0, 8)}</td>
                <td className="mono">{r.product_id.slice(0, 8)}</td>
                <td>{r.qty}</td>
                {isAdmin && (
                  <td className="actions">
                    <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}>Approve</button>
                    <button disabled={busy === r.id} className="danger" onClick={() => decide(r.id, 'reject')}>Reject</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
