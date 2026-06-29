import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

export default function RefillApprovals({ user }) {
  const isAdmin = user?.role === 'admin';
  const { data, error, loading, reload } = useAsync(() => api.get('/api/inventory/refill-requests?status=pending'));
  const delivered = useAsync(() => api.get('/api/inventory/refill-requests?status=delivered'));
  const promoters = useAsync(() => api.get('/api/users?role=promoter'));
  const products = useAsync(() => api.get('/api/products'));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  // Opening-stock form (admin sets a promoter's starting stock once).
  const [open, setOpen] = useState({ promoter_id: '', product_id: '', qty: '' });
  const [openBusy, setOpenBusy] = useState(false);
  const [openMsg, setOpenMsg] = useState('');

  const pName = (id) => (promoters.data || []).find((p) => p.id === id)?.name || id.slice(0, 8);
  const prodName = (id) => { const p = (products.data || []).find((x) => x.id === id); return p ? (p.sku || p.name) : id.slice(0, 8); };

  async function decide(id, action) {
    setBusy(id); setMsg('');
    try {
      await api.post(`/api/inventory/refill-requests/${id}/${action}`, action === 'reject' ? { note: 'rejected from dashboard' } : {});
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  async function setOpening() {
    setOpenBusy(true); setOpenMsg('');
    try {
      await api.post('/api/inventory/opening', {
        promoter_id: open.promoter_id, product_id: open.product_id, qty: Number(open.qty),
      });
      setOpen({ promoter_id: '', product_id: '', qty: '' });
      setOpenMsg('✓ Opening stock set.');
    } catch (e) { setOpenMsg(e.message); }
    finally { setOpenBusy(false); }
  }

  const openValid = open.promoter_id && open.product_id && Number(open.qty) > 0;

  return (
    <section>
      <h2>Stock</h2>

      {isAdmin && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, margin: '12px 0' }}>
          <strong>Set opening stock</strong>
          <p className="muted" style={{ marginTop: 4 }}>Give a promoter their starting stock <b>once per product</b> — after that it's locked and each day's closing carries forward automatically. To add more stock later, use a refill.</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <select value={open.promoter_id} onChange={(e) => setOpen({ ...open, promoter_id: e.target.value })}>
              <option value="">— promoter —</option>
              {(promoters.data || []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.mobile})</option>)}
            </select>
            <select value={open.product_id} onChange={(e) => setOpen({ ...open, product_id: e.target.value })}>
              <option value="">— product —</option>
              {(products.data || []).map((p) => <option key={p.id} value={p.id}>{p.sku || p.name}</option>)}
            </select>
            <input type="number" min="1" placeholder="Quantity" value={open.qty} onChange={(e) => setOpen({ ...open, qty: e.target.value })} />
            <button onClick={setOpening} disabled={openBusy || !openValid}>{openBusy ? 'Saving…' : 'Set opening'}</button>
          </div>
          {openMsg && <p className={openMsg.startsWith('✓') ? 'muted' : 'error'} style={{ marginTop: 8 }}>{openMsg}</p>}
        </div>
      )}

      <h3>Pending refill requests</h3>
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
                <td>{pName(r.promoter_id)}</td>
                <td>{prodName(r.product_id)}</td>
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

      <h3 style={{ marginTop: 24 }}>Delivery discrepancies</h3>
      <p className="muted">When a promoter confirms a different quantity than was approved, it's flagged here to reconcile.</p>
      {(() => {
        const rows = (delivered.data || []).filter((r) => Number(r.delivered_qty) !== Number(r.qty));
        if (delivered.loading) return <p className="muted">Loading…</p>;
        if (rows.length === 0) return <p className="muted">No discrepancies.</p>;
        return (
          <table>
            <thead><tr><th>Delivered</th><th>Promoter</th><th>Product</th><th>Approved</th><th>Received</th><th>Diff</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const diff = Number(r.delivered_qty) - Number(r.qty);
                return (
                  <tr key={r.id}>
                    <td>{r.delivered_at ? new Date(r.delivered_at).toLocaleString() : '—'}</td>
                    <td>{pName(r.promoter_id)}</td>
                    <td>{prodName(r.product_id)}</td>
                    <td>{r.qty}</td>
                    <td>{r.delivered_qty}</td>
                    <td><span className="tag warn">{diff > 0 ? `+${diff}` : diff}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}
    </section>
  );
}
