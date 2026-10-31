import { useEffect, useId, useRef, useState } from 'react';
import { Box, ArrowRight, CloseCircle, Gallery } from 'iconsax-reactjs';
import { CopyButton, Markdown } from './Markdown';
import { GenerateActions } from './GenerateActions';
import { useMedia, mediaUrl } from './media';
import { promptCopyText } from './shot-output';
import type { MasterAsset } from './shot-output';
export function MasterAssetsTable({ assets, messageId }: { assets: MasterAsset[]; messageId: string }) {
  const [selected, setSelected] = useState<MasterAsset | null>(null);
  const [variant, setVariant] = useState('0');
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  const media = useMedia();
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); else if (!selected && dialog.current?.open) dialog.current.close(); }, [selected]);
  const current = selected?.prompts.find(p => p.id === variant);
  const content = variant === 'notes' ? selected?.notes || '' : current?.content || '';
  return <section className="shot-output master-output" aria-label="Master assets"><div className="shot-output-heading"><div><Box size={16} /><strong>Master assets</strong><span>{assets.length} asset</span></div><p>Buka prompt untuk generate image.</p></div>
    <div className="shot-table-scroll" role="region" aria-label="Daftar master assets" tabIndex={0}><table className="shot-table master-table"><caption className="sr-only">Master karakter, lokasi, dan properti.</caption><thead><tr><th scope="col">Asset</th><th scope="col">Jenis</th><th scope="col">Prompt</th><th scope="col">Hasil</th><th scope="col">Aksi</th></tr></thead><tbody>{assets.map(asset => {
      const image = media.jobs.filter(j => j.messageId === messageId && j.assetId === asset.id && j.kind === 'image' && j.status === 'completed').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const busy = media.jobs.some(j => j.messageId === messageId && j.assetId === asset.id && j.status === 'running');
      return <tr key={asset.id}><th scope="row" className="master-asset-id"><code>{asset.id}</code></th><td>{asset.kind}</td><td>{asset.prompts.length} prompt</td><td>{image?.url ? <button type="button" className="master-thumbnail" onClick={() => { setVariant(image.targetId.split(':').at(-1) || '0'); setSelected(asset); }} aria-label={`Lihat hasil ${asset.id}`}><img src={mediaUrl(image.url)} alt={asset.id} /></button> : <span className="master-status">{busy ? 'Generating…' : 'Belum dibuat'}</span>}</td><td><button type="button" className="shot-table-prompt" aria-haspopup="dialog" onClick={() => { setVariant('0'); setSelected(asset); }} aria-label={`Buka master ${asset.id}`}><Gallery size={13} />Prompt & generate<ArrowRight size={12} /></button></td></tr>;
    })}</tbody></table></div>
    <dialog ref={dialog} className="shot-dialog" aria-labelledby={titleId} onClose={() => setSelected(null)} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      {selected && <div className="shot-dialog-layout"><header className="shot-dialog-header"><div className="agent-avatar"><Box size={20} /></div><div><span>MASTER ASSET · {selected.kind.toUpperCase()}</span><h2 id={titleId} className="master-dialog-title">{selected.id}</h2><p>Pilih master image, face anchor, atau outfit anchor untuk generate.</p></div><button type="button" className="icon-button" aria-label="Tutup master asset" onClick={() => dialog.current?.close()}><CloseCircle size={20} /></button></header>
      <div className="master-variants" aria-label="Jenis prompt master">{selected.prompts.map(p => <button type="button" key={p.id} className={variant === p.id ? 'active' : ''} aria-pressed={variant === p.id} onClick={() => setVariant(p.id)}>{p.label}</button>)}{selected.notes && <button type="button" className={variant === 'notes' ? 'active' : ''} aria-pressed={variant === 'notes'} onClick={() => setVariant('notes')}>Warna & profil suara</button>}</div>
      <section className="shot-prompt-panel"><div className="shot-prompt-label"><span>{variant === 'notes' ? 'CATATAN MASTER' : 'NANO BANANA PRO — '+current?.label.toUpperCase()}</span><CopyButton text={promptCopyText(content)} label="Salin prompt" /></div>{current && <GenerateActions key={`${selected.id}-${variant}`} kind="image" prompt={content} messageId={messageId} targetId={`asset:${selected.id}:${variant}`} assetId={selected.id} />}<div className="markdown"><Markdown content={content} /></div></section>
      <footer className="shot-dialog-footer"><span>Gambar dibuat melalui engine image yang dipilih pada proyek.</span><button type="button" onClick={() => dialog.current?.close()}>Selesai</button></footer></div>}
    </dialog>
  </section>;
}
