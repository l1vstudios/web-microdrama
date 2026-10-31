import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, CloseCircle, ArrowDown2 } from 'iconsax-reactjs';
import { api } from './drado-api';
import type { Engine, Lighting, Message } from './drado-api';

type Skill = { name: string; title: string; description: string; status: 'active' | 'disabled' | 'missing'; version?: string };
type Capability = { id: string; title: string; description: string; source: 'core' | 'reference' };
type Supporting = { name: string; title: string; description: string; available: boolean };
type Catalog = { skills: Skill[]; capabilities?: Capability[]; references?: Supporting[]; supportingSkills?: Supporting[] };
const labels = { active: 'Aktif', disabled: 'Nonaktif', missing: 'Belum tersedia' };

export function HermesSkills({ lastMessage, scriptEngine = 'hermes', lighting = 'auto' }: { lastMessage?: Message; scriptEngine?: Engine; lighting?: Lighting }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<'capabilities' | 'skills'>('capabilities');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const tabId = useId();
  useLayoutEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api<Catalog>(`/skills?lighting=${lighting}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(data => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(() => { if (!controller.signal.aborted) setError('Daftar skill belum tersedia. Periksa koneksi atau restart backend.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, lighting]);
  return <>
    <button type="button" className="hermes-skills-trigger" onClick={() => { setTab('capabilities'); setLoading(!catalog); setError(''); setOpen(true); }} aria-haspopup="dialog" aria-label="Lihat kemampuan Drado dan skill Hermes"><Box size={14} /><span>Skill Hermes</span><ArrowDown2 size={11} /></button>
    {createPortal(<dialog ref={dialog} className="shot-dialog hermes-skills-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="shot-dialog-layout"><header className="shot-dialog-header"><div className="agent-avatar"><Box size={20} /></div><div><span>MICRODRAMA WORKFLOW</span><h2 id={titleId}>Drado Agent</h2><p>Kemampuan produksi, referensi, dan skill Hermes.</p></div><button type="button" className="icon-button" aria-label="Tutup daftar skill" onClick={() => dialog.current?.close()}><CloseCircle size={20} /></button></header>
        <div className="hermes-catalog-tabs" role="tablist" aria-label="Informasi Drado" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'capabilities' : event.key === 'End' ? 'skills' : tab === 'capabilities' ? 'skills' : 'capabilities';
          setTab(next); document.getElementById(`${tabId}-${next}`)?.focus();
        }}>{(['capabilities', 'skills'] as const).map(value => <button type="button" key={value} role="tab" id={`${tabId}-${value}`} aria-selected={tab === value} aria-controls={`${tabId}-panel`} tabIndex={tab === value ? 0 : -1} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value === 'capabilities' ? 'Kemampuan Drado' : 'Skill & referensi'}</button>)}</div>
        <section className="hermes-skills-body" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} tabIndex={0} aria-busy={loading}>
          {loading && !catalog ? <div className="hermes-skills-skeleton" role="status"><span className="sr-only">Memuat kemampuan dan daftar skill…</span>{Array.from({ length: 8 }, (_, index) => <div key={index}><i /><span /><span /></div>)}</div> : error ? <p className="generate-error" role="alert">{error}</p> : tab === 'capabilities' ? <>
            <p className="hermes-skills-note">Dari ide cerita hingga arahan lighting, kamera, akting, dan prompt produksi tiap shot.</p>
            {catalog?.capabilities?.length ? <div className="drado-capabilities">{catalog.capabilities.map(capability => <article key={capability.id}><h3>{capability.title}</h3><p>{capability.description}</p>{capability.source === 'reference' && <span>Referensi Storyboard + T2V</span>}</article>)}</div> : <p className="hermes-skills-note">Daftar kemampuan belum tersedia. Restart backend untuk memuat data terbaru.</p>}
          </> : <>
            {lastMessage?.skills?.length ? <section className="hermes-skills-used"><span>{lastMessage?.engine === 'gemini' ? 'INSTRUKSI GEMINI PADA JAWABAN TERAKHIR' : 'DIMUAT HERMES PADA JAWABAN TERAKHIR'}</span><div>{lastMessage.skills.map(name => <code key={name}>{name}</code>)}</div></section> : <p className="hermes-skills-note">Konfigurasi aktif untuk request berikutnya. Riwayat skill pada jawaban lama belum tercatat.</p>}
            <h3 className="hermes-catalog-heading">{scriptEngine === 'gemini' ? 'Instruksi skill untuk Gemini API' : 'Skill yang dimuat otomatis'}</h3><ul className="hermes-skills-list">{catalog?.skills.map(skill => <li key={skill.name}><div className="hermes-skill-title"><strong>{skill.title}</strong><span className={`hermes-skill-status ${skill.status}`}>{labels[skill.status]}</span></div><code>{skill.name}{skill.version ? ` · v${skill.version}` : ''}</code><p>{skill.description}</p>{skill.status === 'active' && <small>{scriptEngine === 'gemini' ? 'Isi skill dimasukkan ke instruksi Gemini; tool Hermes tidak dijalankan.' : 'Dimuat pada setiap request sesuai pilihan lighting proyek.'}</small>}</li>)}</ul>
            {Boolean(catalog?.references?.length) && <section className="hermes-catalog-section"><h3 className="hermes-catalog-heading">Referensi internal Drado</h3><ul className="hermes-skills-list">{catalog!.references!.map(reference => <li key={reference.name}><div className="hermes-skill-title"><strong>{reference.title}</strong><span className="hermes-skill-status">{reference.available ? 'Tersedia' : 'Belum tersedia'}</span></div><p>{reference.description}</p><small>Dibaca sesuai kebutuhan storyboard dan T2V.</small></li>)}</ul></section>}
            {Boolean(catalog?.supportingSkills?.length) && <section className="hermes-catalog-section"><h3 className="hermes-catalog-heading">Skill pendukung</h3><p className="hermes-skills-note">Tersedia untuk dipanggil sesuai kebutuhan. Pemuatan otomatis tercatat pada bagian di atas.</p><ul className="hermes-skills-list">{catalog!.supportingSkills!.map(skill => <li key={skill.name}><div className="hermes-skill-title"><strong>{skill.title}</strong><span className="hermes-skill-status">{skill.available ? 'Tersedia' : 'Belum tersedia'}</span></div><code>{skill.name}</code><p>{skill.description}</p></li>)}</ul></section>}
          </>}
        </section>
        <footer className="shot-dialog-footer"><span>Kemampuan mengikuti skill dan referensi Drado yang terpasang.</span><button type="button" onClick={() => dialog.current?.close()}>Selesai</button></footer>
      </div>
    </dialog>, document.body)}
  </>;
}
