import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Gallery, VideoPlay, People, Location, Box, SearchNormal1, Refresh2, CloseCircle, DocumentDownload, ArrowRight2 } from 'iconsax-reactjs';
import { mediaUrl, useMedia } from './media';
import type { MediaJob } from './media';
import type { Message } from './drado-api';
import { parseMasterAssets, parseShotOutput, promptCopyText } from './shot-output';
import { GenerateActions } from './GenerateActions';
import { CopyButton, Markdown } from './Markdown';

type Category = 'character' | 'location' | 'prop' | 'storyboard' | 'video';
type Item = { key: string; category: Category; targetId: string; kind: 'image' | 'video'; title: string; detail: string; assetId?: string; messageId: string; prompt?: string; notes?: string };
const categories = [
  { id: 'character', label: 'Master karakter', icon: People, empty: 'Gambar karakter dan anchor akan muncul di sini.' },
  { id: 'location', label: 'Master lokasi', icon: Location, empty: 'Gambar lokasi akan muncul di sini.' },
  { id: 'prop', label: 'Master properti', icon: Box, empty: 'Gambar properti akan muncul di sini.' },
  { id: 'storyboard', label: 'Storyboard', icon: Gallery, empty: 'Keyframe tiap shot akan muncul di sini.' },
  { id: 'video', label: 'Video', icon: VideoPlay, empty: 'Hasil video Omni akan muncul di sini.' },
] as const;
const masterName = (id: string) => id.replace(/^(?:CHAR|LOC|PROP)_/, '').replace(/_\d+$/, '').toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const categoryFor = (assetId: string): Category => assetId.startsWith('CHAR_') ? 'character' : assetId.startsWith('LOC_') ? 'location' : 'prop';
const logicalKey = (targetId: string, kind: string) => `${kind}:${targetId}`;

export function AssetLibrary({ messages, onClose }: { messages: Message[]; onClose: () => void }) {
  const { jobs, error, sessionId } = useMedia();
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { setSearch(''); setSelectedKey(null); }, [sessionId]);
  const items = useMemo(() => {
    const result = new Map<string, Item>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of parseShotOutput(message.content)) {
        if (part.type === 'shot') {
          for (const kind of ['image', 'video'] as const) {
            if (!part.shot[kind]) continue;
            const targetId = `shot:${part.shot.number}`; const key = logicalKey(targetId, kind);
            result.set(key, { key, category: kind === 'image' ? 'storyboard' : 'video', targetId, kind, title: `Shot ${part.shot.number}`, detail: part.shot.title, messageId: message.id, prompt: part.shot[kind], notes: part.shot.notes });
          }
        } else for (const master of parseMasterAssets(part.content)) {
          if (master.type !== 'asset') continue;
          for (const prompt of master.asset.prompts) {
            const assetId = master.asset.id; const targetId = `asset:${assetId}:${prompt.id}`; const key = logicalKey(targetId, 'image');
            result.set(key, { key, category: categoryFor(assetId), targetId, kind: 'image', title: masterName(assetId), detail: prompt.label, assetId, messageId: message.id, prompt: prompt.content, notes: master.asset.notes });
          }
        }
      }
    }
    // Keep generated files discoverable even when a later answer omits the original prompt.
    for (const job of jobs) {
      const key = logicalKey(job.targetId, job.kind);
      if (result.has(key)) continue;
      const number = job.targetId.match(/^shot:(\d+)$/)?.[1];
      result.set(key, { key, category: job.assetId ? categoryFor(job.assetId) : job.kind === 'video' ? 'video' : 'storyboard', targetId: job.targetId, kind: job.kind, title: job.assetId ? masterName(job.assetId) : number ? `Shot ${number}` : 'Hasil produksi', detail: job.assetId ? 'Master image' : job.kind === 'video' ? 'Video Omni' : 'Image keyframe', assetId: job.assetId, messageId: job.messageId });
    }
    return [...result.values()];
  }, [messages, jobs]);
  const results = useMemo(() => {
    const map = new Map<string, { latest: MediaJob; image?: MediaJob }>();
    for (const job of [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const key = logicalKey(job.targetId, job.kind);
      const existing = map.get(key);
      if (!existing) map.set(key, { latest: job, image: job.status === 'completed' && job.url ? job : undefined });
      else if (!existing.image && job.status === 'completed' && job.url) existing.image = job;
    }
    return map;
  }, [jobs]);
  const selected = items.find(item => item.key === selectedKey);
  const selectedResult = selected ? results.get(selected.key) : undefined;
  const preview = selectedResult?.image;
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    else if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const completed = [...results.values()].filter(result => result.image).length;
  const running = jobs.filter(job => job.status === 'running').length;
  const filtered = items.filter(item => `${item.title} ${item.detail} ${item.assetId || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className="context-panel asset-library" aria-label="Library aset proyek">
    <header className="context-heading"><span>ASSET LIBRARY</span><span className="library-total">{completed} hasil</span><button className="icon-button context-mobile-close" aria-label="Tutup library aset" onClick={onClose}><CloseCircle size={17} /></button></header>
    <div className="library-toolbar"><h2>Gambar & produksi</h2><p>Master asset, storyboard, dan video proyekmu.</p><label className="library-search"><SearchNormal1 size={14} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari karakter atau shot…" aria-label="Cari aset proyek" /></label></div>
    <div className="context-body library-body">
      {error && <p className="library-error" role="alert">{error}</p>}
      {!sessionId ? <div className="library-start"><Gallery size={29} /><p>Mulai sebuah proyek</p><span>Gambar hasil generate akan terkumpul di sini.</span></div> : categories.map(category => {
        const group = filtered.filter(item => item.category === category.id);
        if (search && !group.length) return null;
        const count = group.filter(item => results.get(item.key)?.image).length;
        return <details className="library-section" open key={category.id}><summary><category.icon size={15} /><strong>{category.label}</strong><span>{count}{group.length ? ` / ${group.length}` : ''}</span><ArrowRight2 size={12} className="library-chevron" /></summary>
          {!group.length ? <p className="library-section-empty">{category.empty}</p> : <ul className="library-list">{group.map(item => {
            const result = results.get(item.key); const file = result?.image; const latest = result?.latest;
            const status = latest?.status === 'running' ? 'Generating…' : latest?.status === 'failed' ? file ? 'Generate ulang gagal' : 'Generasi gagal' : file ? 'Lihat hasil' : 'Belum dibuat';
            return <li key={item.key}><div className="library-item" title={item.assetId ? `${item.assetId} · ${item.detail}` : item.detail}>
              <button type="button" className={`library-thumb ${item.kind === 'video' ? 'is-video' : ''}`} onClick={() => setSelectedKey(item.key)} aria-haspopup="dialog" aria-label={`Buka ${item.title}, ${item.detail}`}>{file?.url ? item.kind === 'video' ? <><video src={mediaUrl(file.url)} preload="metadata" muted playsInline /><VideoPlay size={20} className="library-play" /></> : <img src={mediaUrl(file.url)} alt={item.title} loading="lazy" /> : latest?.status === 'running' ? <Refresh2 size={19} className="spin" /> : <category.icon size={20} />}</button>
              <div className="library-item-copy"><strong>{item.title}</strong><span>{item.detail}</span><small className={latest?.status === 'failed' ? 'failed' : ''}>{latest?.status === 'running' && <Refresh2 size={9} className="spin" />}{status}</small><button type="button" className="library-detail-button" onClick={() => setSelectedKey(item.key)} aria-haspopup="dialog" aria-label={`Lihat detail ${item.title}, ${item.detail}`}>Lihat detail<ArrowRight2 size={11} /></button></div>
            </div></li>;
          })}</ul>}
        </details>;
      })}
      {sessionId && search && !filtered.length && <p className="library-no-results">Tidak ada aset yang cocok.</p>}
    </div>
    <footer className="context-footer library-footer">{running ? <><Refresh2 size={12} className="spin" />{running} proses generate berjalan</> : <><Gallery size={12} />{completed ? `${completed} hasil tersimpan` : 'Menunggu hasil generate'}</>}</footer>
    <dialog ref={dialog} className="shot-dialog library-preview" aria-labelledby={titleId} onClose={() => setSelectedKey(null)} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      {selected && <div className="shot-dialog-layout"><header className="shot-dialog-header"><div className="agent-avatar">{selected.kind === 'video' ? <VideoPlay size={20} /> : <Gallery size={20} />}</div><div><span>{categories.find(category => category.id === selected.category)?.label.toUpperCase()}</span><h2 id={titleId}>{selected.title}</h2><p>{selected.assetId || selected.detail}{selected.assetId ? ` · ${selected.detail}` : ''}</p></div><button type="button" className="icon-button" aria-label="Tutup preview aset" onClick={() => dialog.current?.close()}><CloseCircle size={20} /></button></header>
      <div className="library-preview-body">{preview?.url ? selected.kind === 'video' ? <video key={preview.id} src={mediaUrl(preview.url)} controls autoPlay playsInline /> : <img src={mediaUrl(preview.url)} alt={`${selected.title} · ${selected.detail}`} /> : <div className="library-preview-empty"><Gallery size={30} /><p>Belum ada hasil yang tersimpan.</p></div>}{!selected.prompt && selectedResult?.latest.status === 'failed' && <p className="generate-error" role="alert">{selectedResult.latest.error}</p>}{preview && <p className="library-preview-meta">{preview.model} · {preview.aspectRatio}{preview.imageSize ? ` · ${preview.imageSize}` : ''}{preview.width && preview.height ? ` · ${preview.width}×${preview.height}` : ''}{preview.upscaled ? ' · Upscale' : ''}{preview.resolution ? ` · ${preview.resolution}` : ''} · {new Date(preview.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
      {selected.prompt && <section className="library-detail-prompt"><GenerateActions key={`${selected.messageId}:${selected.key}`} kind={selected.kind} prompt={selected.prompt} messageId={selected.messageId} targetId={selected.targetId} assetId={selected.assetId} showResult={false} /><details className="library-prompt-content"><summary>{selected.kind === 'image' ? 'Prompt image' : 'Prompt video'}</summary><div className="library-prompt-copy"><CopyButton text={promptCopyText(selected.prompt)} label="Salin prompt" /></div><div className="markdown"><Markdown content={selected.prompt} /></div></details>{selected.notes && <details className="library-prompt-content"><summary>Catatan produksi</summary><div className="markdown"><Markdown content={selected.notes} /></div></details>}</section>}</div>
      <footer className="shot-dialog-footer"><span>{preview ? 'Hasil generate terbaru untuk aset ini.' : selected.prompt ? 'Buka prompt atau generate aset dari detail ini.' : 'Belum ada prompt atau hasil untuk aset ini.'}</span>{preview?.url && <a className="library-download" href={`${mediaUrl(preview.url)}?download=1`} download><DocumentDownload size={14} />Unduh {selected.kind === 'video' ? 'video' : 'gambar'}</a>}</footer></div>}
    </dialog>
  </aside>;
}
