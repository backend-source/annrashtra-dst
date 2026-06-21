import { useState } from 'react';
import { auth } from './api.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';

export default function App() {
  const [user, setUser] = useState(() => auth.user());

  if (!user) return <Login onLogin={(token, u) => { auth.set(token, u); setUser(u); }} />;

  return <Layout user={user} onLogout={() => { auth.clear(); setUser(null); }} />;
}
