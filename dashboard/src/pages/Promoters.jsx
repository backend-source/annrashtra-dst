import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const blank = { name: '', mobile: '', emp_code: '', supervisor_id: '' };

export default function Promoters({ user }) {
  const isAdmin = user?.role === 'admin';
  const promoters = useAsync(() => api.get('/api/users?role=promoter'));
  const supervisors = useAsync(() => (isAdmin ? api.get('/api/users?role=supervisor') : Promise.resolve([])));
  const [form, setForm] = useState(null); // null = closed; {...} = adding
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const mobileOk = /^\d{10}$/.test(form?.mobile?.trim() || '');

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.post('/api/users', {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        emp_code: form.emp_code.trim(),
        supervisor_id: form.supervisor_id || null,
      });
      setForm(null);
      promoters.reload();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <h2>Promoters</h2>
      <p className="muted">
        {isAdmin
          ? 'The field roster. Each promoter has a unique mobile and a unique promoter code (e.g. KHF-001) for ID cards and registers.'
          : 'Read-only — only an admin can add promoters.'}
      </p>
      {isAdmin && !form && <button onClick={() => { setMsg(''); setForm({ ...blank }); }}>+ Add promoter</button>}
      {msg && <p className="error">{msg}</p>}

      {form && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, margin: '12px 0', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Mobile (10 digits)" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input placeholder="Promoter code, e.g. KHF-001 (required)" value={form.emp_code} onChange={(e) => setForm({ ...form, emp_code: e.target.value })} />
          <select value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
            <option value="">— assign supervisor —</option>
            {(supervisors.data || []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.mobile})</option>)}
          </select>
          <div className="actions" style={{ gridColumn: '1 / -1' }}>
            <button onClick={save} disabled={busy || !form.name.trim() || !mobileOk || !form.emp_code.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="link" onClick={() => setForm(null)}>Cancel</button>
            {form.mobile.trim() && !mobileOk && <span className="error" style={{ marginLeft: 8 }}>Mobile must be exactly 10 digits</span>}
          </div>
        </div>
      )}

      {promoters.loading && <p className="muted">Loading…</p>}
      {promoters.error && <p className="error">{promoters.error}</p>}
      {promoters.data && (
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Mobile</th><th>Status</th></tr></thead>
          <tbody>
            {promoters.data.map((p) => (
              <tr key={p.id}>
                <td>{p.emp_code || <span className="muted">—</span>}</td>
                <td>{p.name}</td>
                <td>{p.mobile}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
