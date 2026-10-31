import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, json } from './drado-api';
import type { MediaCost } from './cost';
import type { Engine, Message, Session } from './drado-api';
export type MediaJob = { id: string; messageId: string; targetId: string; assetId?: string; kind: 'image' | 'video'; status: 'running' | 'completed' | 'failed'; engine?: Engine; model: string; aspectRatio: string; resolution?: '720p' | '1080p'; imageSize?: '1K' | '2K'; width?: number; height?: number; upscaled?: boolean; url?: string; error?: string; createdAt: string; cost?: MediaCost };
type GenerateInput = { messageId: string; targetId: string; assetId?: string; kind: 'image' | 'video'; prompt: string; aspectRatio: string; resolution?: '720p' | '1080p'; imageSize?: '1K' };
type State = { imageEngine: Engine; jobs: MediaJob[]; error: string; sessionId: string; generate: (input: GenerateInput) => Promise<void>; deleteMessage: (messageId: string, expectedContent: string) => Promise<void>; saveMessage: (messageId: string, expectedContent: string, content: string) => Promise<void> };
const Context = createContext<State>({ imageEngine: 'gemini', jobs: [], error: '', sessionId: '', deleteMessage: async () => { throw new Error('Buka proyek terlebih dahulu.'); }, generate: async () => { throw new Error('Buka proyek terlebih dahulu.'); }, saveMessage: async () => { throw new Error('Buka proyek terlebih dahulu.'); } });
export const useMedia = () => useContext(Context);
export const mediaUrl = (url: string) => `${(import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')}${url}`;
export function MediaProvider({ sessionId, imageEngine = 'gemini', children, onMessageUpdated, onMessageDeleted }: { sessionId: string; imageEngine?: Engine; children: ReactNode; onMessageDeleted?: (session: Session, messageId: string) => void; onMessageUpdated?: (message: Message, sessionId: string, updatedAt: string) => void }) {
  const [jobs, setJobs] = useState<MediaJob[]>([]); const [error, setError] = useState('');
  const selected = useRef(sessionId); selected.current = sessionId;
  const jobsSession = useRef(sessionId);
  const root = `/sessions/${sessionId}/media`;
  useEffect(() => {
    jobsSession.current = sessionId; setJobs([]); setError(''); if (!sessionId) return;
    const controller = new AbortController();
    api<{ jobs: MediaJob[] }>(root, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setJobs(data.jobs); }).catch(err => { if (!controller.signal.aborted) setError(`Restart backend dengan bun run bridge untuk mengaktifkan generate. ${err.message}`); });
    return () => controller.abort();
  }, [root, sessionId]);
  const busy = jobs.some(j => j.status === 'running');
  useEffect(() => {
    if (!sessionId || !busy) return;
    let cancelled = false; let pending = false;
    const timer = setInterval(async () => {
      if (pending) return; pending = true;
      try { const data = await api<{ jobs: MediaJob[] }>(root); if (!cancelled && selected.current === sessionId) { setJobs(data.jobs); setError(''); } }
      catch (err) { if (!cancelled) setError((err as Error).message); }
      finally { pending = false; }
    }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [busy, root, sessionId]);
  async function generate(input: GenerateInput) {
    const response = await api<{ job: MediaJob }>(root, json(input));
    if (selected.current === sessionId) { setJobs(current => [response.job, ...current.filter(j => j.id !== response.job.id)]); setError(''); }
  }
  async function deleteMessage(messageId: string, expectedContent: string) {
    const data = await api<{ session: Session }>(`/sessions/${sessionId}/messages/${messageId}`, { method: 'DELETE', body: JSON.stringify({ expectedContent }) });
    if (selected.current === sessionId) setJobs(current => current.filter(job => job.messageId !== messageId));
    onMessageDeleted?.(data.session, messageId);
  }
  async function saveMessage(messageId: string, expectedContent: string, content: string) {
    const data = await api<{ message: Message; updatedAt: string }>(`/sessions/${sessionId}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ expectedContent, content }) });
    onMessageUpdated?.(data.message, sessionId, data.updatedAt);
  }
  return <Context.Provider value={{ imageEngine, jobs: jobsSession.current === sessionId ? jobs : [], error: jobsSession.current === sessionId ? error : '', sessionId, generate, deleteMessage, saveMessage }}>{children}</Context.Provider>;
}
