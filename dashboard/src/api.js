// Tiny fetch wrapper. Token + user are kept in localStorage.
const BASE = import.meta.env.VITE_API_BASE || '';

export const auth = {
  token: () => localStorage.getItem('token'),
  user: () => JSON.parse(localStorage.getItem('user') || 'null'),
  set: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  clear: () => localStorage.clear(),
};

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth.token() ? { authorization: `Bearer ${auth.token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b),
};

// Fetch a file with auth and trigger a browser download (a plain <a> can't send
// the bearer token, so we fetch -> blob -> click).
export async function downloadFile(path, filename) {
  const res = await fetch(BASE + path, {
    headers: auth.token() ? { authorization: `Bearer ${auth.token()}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
