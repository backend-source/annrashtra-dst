import { useState } from 'react';
import { api, downloadFile } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

function statusTag(c) {
  if (c.status === 'received') return <span className="tag ok">accepted{c.confirmed_by_name ? ` · ${c.confirmed_by_name}` : ''}</span>;
  if (c.status === 'verified') return <span className="tag" style={{ background: '#dcebff', color: '#1b4a8a' }}>awaiting promoter</span>;
  if (c.status === 'disputed') return <span className="tag" style={{ background: '#f4d9d2', color: '#b3361f' }}>disputed</span>;
  return <span className="tag">pending</span>;
}

export default function Collections() {
  const [view, setView] = useState('handovers'); // 'handovers' | 'ledger'
  const { data, error, loading, reload } = useAsync(() => api.get('/api/collections'));
  const [edit, setEdit] = useState(null); // { id, amount, upi_amount }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function openVerify(c) {
    setMsg('');
    setEdit({ id: c.id, amount: c.amount ?? 0, upi_amount: c.upi_amount ?? 0 });
  }

  async function submitVerify() {
    setBusy(true); setMsg('');
    try {
      await api.post(`/api/collections/${edit.id}/verify`, {
        amount: Number(edit.amount) || 0,
        upi_amount: Number(edit.upi_amount) || 0,
      });
      setEdit(null);
      reload();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  const mismatch = (a, b) => Number(a) !== Number(b);

  return (
    <section>
      <h2>Cash collections</h2>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
        <button className={view === 'handovers' ? '' : 'link'} onClick={() => setView('handovers')}>Handovers</button>
        <button className={view === 'ledger' ? '' : 'link'} onClick={() => setView('ledger')}>Balance ledger</button>
      </div>
      {view === 'ledger' && <Ledger />}
      {view === 'handovers' && <>
      <p className="muted">
        Promoters hand over the day's cash + UPI. Verify the amounts against expected sales (edit if they differ),
        then it goes to the promoter to accept.
      </p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">No handovers yet.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr><th>Day</th><th>Promoter</th><th>Expected (cash / UPI)</th><th>Handed (cash / UPI)</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>{c.day}</td>
                <td>{c.promoter_name}</td>
                <td>{inr(c.expected_cash)} / {inr(c.expected_upi)}</td>
                <td>
                  {edit?.id === c.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ width: 90 }} type="number" min="0" value={edit.amount}
                        onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="Cash" />
                      <input style={{ width: 90 }} type="number" min="0" value={edit.upi_amount}
                        onChange={(e) => setEdit({ ...edit, upi_amount: e.target.value })} placeholder="UPI" />
                    </div>
                  ) : (
                    <span>
                      <span style={mismatch(c.amount, c.expected_cash) ? { color: 'var(--danger)' } : undefined}>{inr(c.amount)}</span>
                      {' / '}
                      <span style={mismatch(c.upi_amount, c.expected_upi) ? { color: 'var(--danger)' } : undefined}>{inr(c.upi_amount)}</span>
                    </span>
                  )}
                </td>
                <td>
                  {statusTag(c)}
                  {c.status === 'disputed' && c.dispute_note && <div className="muted" style={{ fontSize: 12 }}>“{c.dispute_note}”</div>}
                </td>
                <td className="actions">
                  {edit?.id === c.id ? (
                    <>
                      <button disabled={busy} onClick={submitVerify}>{busy ? 'Saving…' : 'Send to promoter'}</button>
                      <button className="link" onClick={() => setEdit(null)}>Cancel</button>
                    </>
                  ) : (c.status === 'pending' || c.status === 'disputed') ? (
                    <button onClick={() => openVerify(c)}>Verify</button>
                  ) : c.status === 'verified' ? (
                    <button className="link" onClick={() => openVerify(c)}>Re-verify</button>
                  ) : (
                    <span className="muted">done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </>}
    </section>
  );
}

// #4 — running cash & UPI balance per promoter per day. Opening carries forward
// from the prior day's closing; balance = what the promoter still holds.
function Ledger() {
  const { data, error, loading } = useAsync(() => api.get('/api/reports/ledger'));
  const rows = data?.rows || [];
  return (
    <div>
      <p className="muted">
        Running balance — opening (carried from the previous day) + collected − handed over = balance still in hand.
        Cash and UPI are tracked separately.
        <button className="link" style={{ marginLeft: 8 }}
          onClick={() => downloadFile('/api/reports/export/ledger', 'ledger.csv')}>Download CSV</button>
      </p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && <p className="muted">No activity yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Day</th><th>Promoter</th>
              <th>Cash: open</th><th>+ in</th><th>− handed</th><th>balance</th>
              <th>UPI: open</th><th>+ in</th><th>− handed</th><th>balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.code || r.promoter}-${r.day}-${i}`}>
                <td>{r.day}</td>
                <td>{r.promoter}{r.code ? ` (${r.code})` : ''}</td>
                <td>{inr(r.opening_cash)}</td>
                <td>{inr(r.collected_cash)}</td>
                <td>{inr(r.handed_cash)}</td>
                <td><b style={r.balance_cash > 0 ? { color: 'var(--danger)' } : undefined}>{inr(r.balance_cash)}</b></td>
                <td>{inr(r.opening_upi)}</td>
                <td>{inr(r.collected_upi)}</td>
                <td>{inr(r.handed_upi)}</td>
                <td><b style={r.balance_upi > 0 ? { color: 'var(--danger)' } : undefined}>{inr(r.balance_upi)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
