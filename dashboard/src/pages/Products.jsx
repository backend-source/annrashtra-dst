import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

export default function Products({ user }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/products'));
  const isAdmin = user.role === 'admin';
  const [edit, setEdit] = useState({});   // id -> price string
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  async function save(id) {
    const price = Number(edit[id]);
    if (!(price > 0)) { setMsg('Price must be a positive number'); return; }
    setBusy(id); setMsg('');
    try {
      await api.patch(`/api/products/${id}`, { price });
      setEdit((e) => { const c = { ...e }; delete c[id]; return c; });
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  return (
    <section>
      <h2>Products &amp; pricing</h2>
      <p className="muted">{isAdmin ? 'Edit prices below (admin only). Prices are read from here for every sale.' : 'Read-only — only an admin can change prices.'}</p>
      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th>Price (₹)</th><th>Active</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.sku}</td>
                <td>{p.name}</td>
                <td>
                  {isAdmin ? (
                    <input
                      className="price"
                      value={edit[p.id] ?? p.price}
                      onChange={(e) => setEdit((s) => ({ ...s, [p.id]: e.target.value }))}
                    />
                  ) : Number(p.price).toFixed(2)}
                </td>
                <td>{p.active ? 'yes' : 'no'}</td>
                {isAdmin && (
                  <td className="actions">
                    <button disabled={busy === p.id || edit[p.id] === undefined} onClick={() => save(p.id)}>Save</button>
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
