import { useEffect, useState } from 'react';

type Settings = { aspectRatio: string; resolution: '720p' | '1080p'; imageSize: '1K' };
const eventName = 'drado:generation-settings';
function read(key: string, fallback: string, master: boolean): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const allowed = master ? ['1:1', '9:16', '16:9', '4:3', '3:4'] : ['9:16', '16:9'];
    return { aspectRatio: allowed.includes(value.aspectRatio) ? value.aspectRatio : allowed.includes(fallback) ? fallback : '9:16', resolution: value.resolution === '1080p' ? '1080p' : '720p', imageSize: '1K' };
  } catch { return { aspectRatio: master ? '1:1' : ['16:9', '9:16'].includes(fallback) ? fallback : '9:16', resolution: '720p', imageSize: '1K' }; }
}

export function useGenerationSettings(sessionId: string, messageId: string, targetId: string, fallback: string, master: boolean) {
  const key = `drado.generate.${sessionId}.${messageId}.${targetId}`;
  const [settings, setSettings] = useState(() => read(key, fallback, master));
  useEffect(() => {
    const refresh = () => setSettings(read(key, fallback, master));
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === key) refresh(); };
    const stored = (event: StorageEvent) => { if (event.key === key || event.key === null) refresh(); };
    refresh(); window.addEventListener(eventName, changed); window.addEventListener('storage', stored);
    return () => { window.removeEventListener(eventName, changed); window.removeEventListener('storage', stored); };
  }, [key, fallback, master]);
  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new CustomEvent(eventName, { detail: key })); } catch { /* Controls still work when browser storage is unavailable. */ }
  }
  return { settings, update };
}

