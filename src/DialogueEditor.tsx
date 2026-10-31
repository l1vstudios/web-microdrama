import { useEffect, useMemo, useState } from 'react';
import { extractDialogue, replaceShotDialogue } from './prompt-dialogue';
import { useMedia } from './media';
import type { Shot } from './shot-output';

export function DialogueEditor({ shot, messageId, messageContent }: { shot: Shot; messageId: string; messageContent: string }) {
  const { saveMessage } = useMedia();
  const lines = useMemo(() => extractDialogue(shot.video), [shot.video]);
  const [values, setValues] = useState(() => lines.map(line => line.text));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValues(lines.map(line => line.text)); setError(''); }, [lines]);
  const dirty = lines.some((line, index) => values[index] !== line.text);
  async function save() {
    if (saving || !dirty) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const content = replaceShotDialogue(messageContent, shot, lines, values);
      await saveMessage(messageId, messageContent, content);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Dialog gagal disimpan.'); }
    finally { setSaving(false); }
  }
  return <div className="dialogue-editor">
    <p className="dialogue-description">Edit ucapan karakter. Simpan untuk mengganti dialog pada prompt shot ini.</p>
    {lines.length ? <>{lines.map((line, index) => <label className="dialogue-line" key={line.id}><span><strong>{line.speaker}</strong>{line.speakerId && <code className="dialogue-speaker-id">{line.speakerId}</code>}{line.emotion && <small>{line.emotion}</small>}</span><textarea rows={3} maxLength={2000} value={values[index] ?? line.text} disabled={saving} onChange={event => { setValues(current => lines.map((entry, i) => i === index ? event.target.value : current[i] ?? entry.text)); setSaved(false); setError(''); }} aria-label={`Dialog ${line.speaker}, baris ${index + 1}`} /></label>)}
    <div className="dialogue-editor-actions"><button type="button" className="dialogue-save" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan dialog'}</button><button type="button" disabled={!dirty || saving} onClick={() => { setValues(lines.map(line => line.text)); setSaved(false); setError(''); }}>Reset perubahan</button><span role="status">{saved ? 'Dialog tersimpan ke prompt.' : dirty ? 'Perubahan belum disimpan.' : ''}</span></div></> : <p className="dialogue-empty">Tidak ada ucapan dialog yang terdeteksi pada prompt video ini.</p>}
    {error && <p className="generate-error" role="alert">{error}</p>}
  </div>;
}
