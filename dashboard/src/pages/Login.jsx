import { useState } from 'react';
import { api } from '../api.js';

// Two-step OTP login. In dev the OTP is printed in the API server log (MSG91 dev
// adapter); in production it is delivered by SMS.
export default function Login({ onLogin }) {
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post('/api/auth/otp/request', { mobile });
      setStep('code');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { token, user } = await api.post('/api/auth/otp/verify', { mobile, code });
      if (user.role === 'promoter') { setError('Promoters use the mobile app, not the dashboard.'); return; }
      onLogin(token, user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="card">
        <h1>Annrashtra DST</h1>
        <p className="muted">Admin &amp; Supervisor dashboard</p>
        {step === 'mobile' ? (
          <form onSubmit={request}>
            <label>Mobile number</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="9999000002" autoFocus />
            <button disabled={busy || !mobile}>{busy ? 'Sending…' : 'Send OTP'}</button>
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
