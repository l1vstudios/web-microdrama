import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown2, Setting2 } from 'iconsax-reactjs';
import type { Engine, EngineCatalog, Engines } from './drado-api';
import { useMedia } from './media';

export function EnginePicker({ value, catalog, disabled, saving, onChange }: { value: Engines; catalog: EngineCatalog | null; disabled: boolean; saving: boolean; onChange: (engines: Engines) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const { jobs } = useMedia();
  const mediaBusy = jobs.some(job => job.status === 'running');
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  async function change(kind: keyof Engines, engine: Engine) {
    setError('');
    try { await onChange({ ...value, [kind]: engine }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan engine.'); }
  }
  return <div className="engine-picker" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" className="hermes-skills-trigger engine-picker-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}><Setting2 size={14} /><span>Engine</span><ArrowDown2 size={11} /></button>
    {open && <section className="engine-picker-panel" id={panelId} aria-label="Pilihan engine produksi"><header><strong>Engine produksi</strong><span>Script dan image dapat memakai engine berbeda.</span></header>
      {(['script', 'image'] as const).map(kind => <label key={kind}>{kind === 'script' ? 'Script & prompt' : 'Image & master asset'}<span className="engine-select"><select value={value[kind]} disabled={disabled || saving || mediaBusy || !catalog} onChange={event => void change(kind, event.target.value as Engine)}>{(catalog?.[kind] || [{ id: 'hermes', label: 'ChatGPT via Hermes', available: false }, { id: 'gemini', label: 'Gemini via API', available: false }]).map(engine => <option key={engine.id} value={engine.id} disabled={!engine.available}>{engine.label}{!engine.available ? ' · Belum siap' : ''}</option>)}</select><ArrowDown2 size={13} aria-hidden="true" /></span><small>{catalog?.[kind].find(engine => engine.id === value[kind])?.model || 'Memuat konfigurasi…'}</small></label>)}
      <p>Video memakai Gemini Omni Flash. Image Hermes memakai login ChatGPT di Hermes.</p>
      {saving && <p role="status">Menyimpan pilihan…</p>}
      {error && <p className="generate-error" role="alert">{error}</p>}
    </section>}
  </div>;
}
