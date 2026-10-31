import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, json, resetAuthRequests } from './drado-api';
import LoginPage from './LoginPage';

type User = { id: string; username: string; displayName: string };
type Auth = { user: User | null; logout: () => Promise<void> };
const Context = createContext<Auth>({ user: null, logout: async () => {} });
export const useAuth = () => useContext(Context);

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    api<{ user: User }>('/auth/me', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(data => { if (!controller.signal.aborted) { setUser(data.user); setNotice(''); } })
      .catch(error => {
        if (controller.signal.aborted) return;
        setUser(null);
        setNotice(error instanceof ApiError && error.status === 401 ? '' : 'Backend belum terhubung. Jalankan bun run bridge, lalu coba kembali.');
      })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const expired = () => { resetAuthRequests(); setUser(null); setNotice('Sesi login berakhir. Silakan masuk kembali.'); };
    window.addEventListener('drado:unauthorized', expired);
    return () => window.removeEventListener('drado:unauthorized', expired);
  }, []);
  async function login(username: string, password: string) {
    const data = await api<{ user: User }>('/auth/login', json({ username, password }));
    resetAuthRequests(); setUser(data.user); setNotice('');
  }
  async function logout() {
    await api('/auth/logout', json({}));
    resetAuthRequests(); setUser(null); setNotice('');
  }
  return <Context.Provider value={{ user, logout }}>{checking ? <main className="drado-auth-loading" role="status"><strong>DRADO AI</strong><span>Memeriksa sesi login…</span></main> : user ? children : <LoginPage onLogin={login} notice={notice} onRetry={() => setRetry(value => value + 1)} />}</Context.Provider>;
}
