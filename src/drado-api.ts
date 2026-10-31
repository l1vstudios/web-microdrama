export type Lighting = 'auto' | 'drama' | 'outdoor' | 'horror' | 'fantasy' | 'anime';
export type Engine = 'hermes' | 'gemini';
export type Engines = { script: Engine; image: Engine };
export type EngineOption = { id: Engine; label: string; model?: string; available: boolean };
export type EngineCatalog = { script: EngineOption[]; image: EngineOption[] };
export const defaultEngines: Engines = { script: 'hermes', image: 'gemini' };
export type Message = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; editedAt?: string; skills?: string[]; engine?: Engine };
export type Session = { id: string; title: string; createdAt: string; updatedAt: string; messages: Message[]; status: 'idle' | 'running' | 'error'; error?: string; engines?: Engines; lighting?: Lighting; workflow?: 'default' | 'storyboard'; storyboardEpisodes?: number };
export type SessionSummary = Omit<Session, 'messages'> & { messageCount: number };
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
let authEpoch = 0;
export const resetAuthRequests = () => { authEpoch++; };
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const epoch = authEpoch;
  const response = await fetch(`${base}/api/drado${path}`, {
    ...options, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers }, signal: options.signal || AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && epoch === authEpoch) window.dispatchEvent(new Event('drado:unauthorized'));
    throw new ApiError(response.status === 401 && !path.startsWith('/auth/') ? 'Sesi login berakhir. Silakan masuk kembali.' : data?.error || 'Backend Drado belum terhubung. Jalankan bun run bridge di morai-backend dan coba lagi.', response.status);
  }
  return data;
}
export const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
