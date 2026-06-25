import { useState } from 'react';
import { api } from '../api.js';
import { useAsync } from '../components/useAsync.js';

const blank = { role: 'promoter', name: '', mobile: '', emp_code: '', supervisor_id: '' };

export default function Team({ user }) {
  const isAdmin = user?.role === 'admin';
  const people = useAsync(() => api.get('/api/users')); // all staff (promoters, supervisors, admins)
  const [form, setForm] = useState(null); // null = closed; {...} = adding
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const list = people.data || [];
  const supervisors = list.filter((p) => p.role === 'supervisor');
  const isPromoter = form?.role === 'promoter';
  const mobileOk = /^\d{10}$/.test(form?.mobile?.trim() || '');
  const codeOk = !isPromoter || !!form?.emp_code?.trim(); // code required for promoters only

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.post('/api/users', {
        role: form.role,
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        emp_code: form.emp_code.trim() || null,
        supervisor_id: isPromoter ? (form.supervisor_id || null) : null,
      });
      setForm(null);
      people.reload();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  function roleTag(r) {
    if (r === 'admin') return <span className="tag">admin</span>;
    if (r === 'supervisor') return <span className="tag ok">supervisor</span>;
    return <span className="tag">promoter</span>;
  }

  return (
    <section>
      <h2>Team</h2>
      <p className="muted">
        {isAdmin
          ? 'Your field staff. Add promoters (with a unique code, e.g. KHF-001) and the supervisors who oversee them. They log in by mobile number.'
          : 'Read-only — only an admin can add team members.'}
      </p>
      {isAdmin && !form && <button onClick={() => { setMsg(''); setForm({ ...blank }); }}>+ Add team member</button>}
      {msg && <p className="error">{msg}</p>}

      {form && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, margin: '12px 0', display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="promoter">Promoter</option>
            <option value="supervisor">Supervisor</option>
          </select>
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Mobile (10 digits)" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input placeholder={isPromoter ? 'Promoter code, e.g. KHF-001 (required)' : 'Code (optional)'} value={form.emp_code} onChange={(e) => setForm({ ...form, emp_code: e.target.value })} />
          {isPromoter && (
            <select value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
              <option value="">— assign supervisor —</option>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.mobile})</option>)}
            </select>
          )}
          <div className="actions" style={{ gridColumn: '1 / -1' }}>
            <button onClick={save} disabled={busy || !form.name.trim() || !mobileOk || !codeOk}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="link" onClick={() => setForm(null)}>Cancel</button>
            {form.mobile.trim() && !mobileOk && <span className="error" style={{ marginLeft: 8 }}>Mobile must be exactly 10 digits</span>}
          </div>
        </div>
      )}

      {people.loading && <p className="muted">Loading…</p>}
      {people.error && <p className="error">{people.error}</p>}
      {people.data && (
        <table>
          <thead><tr><th>Role</th><th>Code</th><th>Name</th><th>Mobile</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{roleTag(p.role)}</td>
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
