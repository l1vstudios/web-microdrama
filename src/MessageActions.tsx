import { useRef, useState } from 'react';
import { Trash } from 'iconsax-reactjs';
import { CopyButton } from './Markdown';
import { useMedia } from './media';
import type { Message } from './drado-api';

export function MessageActions({ message, busy }: { message: Message; busy: boolean }) {
  const { deleteMessage, jobs } = useMedia();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const disabled = busy || pending || jobs.some(job => job.status === 'running');
  const hasMedia = jobs.some(job => job.messageId === message.id);
  async function remove() {
    if (lock.current || disabled) return;
    lock.current = true; setPending(true); setError('');
    try { await deleteMessage(message.id, message.content); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menghapus pesan.'); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className="message-actions message-delete-actions">
    {message.role === 'assistant' && <CopyButton text={message.content} label="Salin jawaban" />}
    {!confirming ? <button type="button" className="message-delete-trigger" disabled={disabled} onClick={() => { setConfirming(true); setError(''); }}><Trash size={13} />Hapus pesan</button> : <div className="message-delete-confirm" role="group" aria-label="Konfirmasi hapus pesan"><span>{hasMedia ? 'Hapus pesan dan hasil generasi terkait dari library? Riwayat biaya tetap tersimpan.' : 'Hapus pesan ini dari percakapan dan konteks Drado?'}</span><button type="button" disabled={disabled} onClick={() => void remove()}>{pending ? 'Menghapus…' : 'Hapus'}</button><button type="button" disabled={pending} onClick={() => setConfirming(false)}>Batal</button></div>}
    {error && <p className="generate-error" role="alert">{error}</p>}
  </div>;
}
