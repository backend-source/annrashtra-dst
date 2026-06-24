import { useState } from 'react';
import { api } from '../api.js';

// Login. Tries a direct sign-in first; if the server requires OTP it falls back
// to the OTP step. So the same build works whether OTP is on or temporarily off.
export default function Login({ onLogin }) {
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function finish(token, user) {
    if (user.role === 'promoter') { setError('Promoters use the mobile app, not the dashboard.'); return; }
    onLogin(token, user);
  }

  async function start(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await api.post('/api/auth/login', { mobile });
      if (res.token) { finish(res.token, res.user); return; } // direct (OTP disabled)
      await api.post('/api/auth/otp/request', { mobile });    // OTP required
      setStep('code');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { token, user } = await api.post('/api/auth/otp/verify', { mobile, code });
      finish(token, user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="card">
        <h1>Annrashtra DST</h1>
        <p className="muted">Admin &amp; Supervisor dashboard</p>
        {step === 'mobile' ? (
          <form onSubmit={start}>
            <label>Mobile number</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="9999000002" autoFocus />
            <button disabled={busy || !mobile}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label>OTP sent to {mobile}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" autoFocus />
            <button disabled={busy || !code}>{busy ? 'Verifying…' : 'Verify'}</button>
            <button type="button" className="link" onClick={() => setStep('mobile')}>Change number</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
