import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

export default function Products({ user }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/products'));
  const isAdmin = user.role === 'admin';
  const [edit, setEdit] = useState({});   // id -> { price, points }
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  // Add-product form (#11).
  const [add, setAdd] = useState({ name: '', sku: '', price: '', points: '' });
  const [addBusy, setAddBusy] = useState(false);

  function field(id, key, fallback) {
    return edit[id]?.[key] ?? fallback;
  }
  function setField(id, key, value) {
    setEdit((s) => ({ ...s, [id]: { ...s[id], [key]: value } }));
  }

  async function save(id) {
    const e = edit[id] || {};
    const body = {};
    if (e.price !== undefined) {
      const price = Number(e.price);
      if (!(price > 0)) { setMsg('Price must be a positive number'); return; }
      body.price = price;
    }
    if (e.points !== undefined) {
      const points = Number(e.points);
      if (!Number.isInteger(points) || points < 0) { setMsg('Points must be a whole number ≥ 0'); return; }
      body.points = points;
    }
    if (Object.keys(body).length === 0) return;
    setBusy(id); setMsg('');
    try {
      await api.patch(`/api/products/${id}`, body);
      setEdit((s) => { const c = { ...s }; delete c[id]; return c; });
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  async function toggleActive(p) {
    setBusy(p.id); setMsg('');
    try {
      await api.patch(`/api/products/${p.id}`, { active: !p.active });
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setBusy(null); }
  }

  async function addProduct() {
    const price = Number(add.price);
    const points = add.points === '' ? 0 : Number(add.points);
    if (!add.name.trim() || !add.sku.trim()) { setMsg('Name and SKU are required'); return; }
    if (!(price > 0)) { setMsg('Price must be a positive number'); return; }
    setAddBusy(true); setMsg('');
    try {
      await api.post('/api/products', { name: add.name.trim(), sku: add.sku.trim(), price, points });
      setAdd({ name: '', sku: '', price: '', points: '' });
      reload();
    } catch (err) { setMsg(err.message); }
    finally { setAddBusy(false); }
  }

  return (
    <section>
      <h2>Products &amp; pricing</h2>
      <p className="muted">{isAdmin
        ? 'Edit price and reward points per unit (admin only). Prices are read from here for every sale; points are awarded per packet sold.'
        : 'Read-only — only an admin can change products.'}</p>

      {isAdmin && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, margin: '12px 0' }}>
          <strong>Add a product</strong>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginTop: 8 }}>
            <input placeholder="Name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
            <input placeholder="SKU" value={add.sku} onChange={(e) => setAdd({ ...add, sku: e.target.value })} />
            <input type="number" min="1" placeholder="Price ₹" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} />
            <input type="number" min="0" placeholder="Points / unit" value={add.points} onChange={(e) => setAdd({ ...add, points: e.target.value })} />
            <button onClick={addProduct} disabled={addBusy}>{addBusy ? 'Adding…' : 'Add product'}</button>
          </div>
        </div>
      )}

      {msg && <p className="error">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th>Price (₹)</th><th>Points/unit</th><th>Active</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                <td className="mono">{p.sku}</td>
                <td>{p.name}</td>
                <td>
                  {isAdmin ? (
                    <input className="price" value={field(p.id, 'price', p.price)}
                      onChange={(e) => setField(p.id, 'price', e.target.value)} />
                  ) : Number(p.price).toFixed(2)}
                </td>
                <td>
                  {isAdmin ? (
                    <input className="price" style={{ width: 70 }} value={field(p.id, 'points', p.points ?? 0)}
                      onChange={(e) => setField(p.id, 'points', e.target.value)} />
                  ) : (p.points ?? 0)}
                </td>
                <td>{p.active ? <span className="tag ok">yes</span> : <span className="tag">no</span>}</td>
                {isAdmin && (
                  <td className="actions">
                    <button disabled={busy === p.id || !edit[p.id]} onClick={() => save(p.id)}>Save</button>
                    <button disabled={busy === p.id} className={p.active ? 'danger' : ''} onClick={() => toggleActive(p)}>
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
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
