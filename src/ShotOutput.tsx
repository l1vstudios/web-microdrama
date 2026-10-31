import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowRight2 as ChevronRight, VideoPlay as Clapperboard, Clock as Clock3, VideoSquare as Film, Gallery as Image, CloseCircle as X, MessageText, Trash } from 'iconsax-reactjs';
import { CopyButton, Markdown } from './Markdown';
import { parseShotOutput, parseMasterAssets, promptCopyText, removeShotTable } from './shot-output';
import { GenerateActions } from './GenerateActions';
import { MasterAssetsTable } from './MasterAssets';
import type { Shot, MasterAsset } from './shot-output';
import { DialogueEditor } from './DialogueEditor';
import { useMedia } from './media';

type Tab = 'image' | 'video' | 'dialogue' | 'notes';
export function ShotTable({ shots, messageId, messageContent }: { shots: Shot[]; messageId: string; messageContent: string }) {
  const { saveMessage } = useMedia();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteLock = useRef(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const selected = shots.find(shot => shot.number === selectedNumber);
  const [tab, setTab] = useState<Tab>('image');
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  const tabId = useId();
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    else if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const close = () => dialog.current?.close();
  const prompt = tab !== 'dialogue' ? selected?.[tab] || '' : '';
  async function deleteTable() {
    if (deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setDeleteError('');
    try { await saveMessage(messageId, messageContent, removeShotTable(messageContent, shots)); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : 'Tabel gagal dihapus.'); }
    finally { deleteLock.current = false; setDeleting(false); }
  }
  return <section className="shot-output" aria-label="Shot produksi">
    <div className="shot-output-heading"><div><Clapperboard size={16} /><strong>Shot produksi</strong><span>{shots.length} shot</span><button type="button" className="shot-table-delete" disabled={deleting} aria-expanded={confirmDelete} onClick={() => { setConfirmDelete(!confirmDelete); setDeleteError(''); }}><Trash size={13} />Hapus tabel</button></div><p>Pilih shot untuk membuka prompt.</p></div>
    {confirmDelete && <div className="shot-delete-confirm"><p>Hapus seluruh {shots.length} shot beserta prompt dalam tabel ini?</p><div><button type="button" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteError(''); }}>Batal</button><button type="button" className="shot-delete-apply" disabled={deleting} onClick={() => void deleteTable()}>{deleting ? 'Menghapus…' : 'Hapus tabel'}</button></div></div>}
    {deleteError && <p className="generate-error shot-delete-error" role="alert">{deleteError}</p>}
    <div className="shot-table-scroll" role="region" aria-label="Daftar shot produksi" tabIndex={0}>
      <table className="shot-table">
        <caption className="sr-only">Daftar shot, adegan, durasi, waktu, dan prompt produksi.</caption>
        <thead><tr><th scope="col">Shot</th><th scope="col">Adegan</th><th scope="col">Durasi</th><th scope="col">Waktu</th><th scope="col">Nano Banana Pro</th><th scope="col">Omni Flash</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>{shots.map(shot => {
          const open = (nextTab: Tab = shot.image ? 'image' : shot.video ? 'video' : 'notes') => { setTab(nextTab); setSelectedNumber(shot.number); };
          return <tr key={shot.id} className="shot-table-row" onClick={() => open()}>
            <th scope="row"><span className="shot-row-number">Shot {shot.number}</span></th>
            <td className="shot-row-title">{shot.title}</td>
            <td className="shot-row-duration">{shot.duration ? <span><Clock3 size={12} />{shot.duration} detik</span> : '—'}</td>
            <td className="shot-row-time">{shot.timeRange || '—'}</td>
            <td><button type="button" className="shot-table-prompt" disabled={!shot.image} aria-haspopup="dialog" aria-label={`Buka Nano Banana Pro Shot ${shot.number}`} onClick={e => { e.stopPropagation(); open('image'); }}><Image size={13} />{shot.image ? 'Prompt' : 'Belum ada'}</button></td>
            <td><button type="button" className="shot-table-prompt" disabled={!shot.video} aria-haspopup="dialog" aria-label={`Buka Omni Flash Shot ${shot.number}`} onClick={e => { e.stopPropagation(); open('video'); }}><Film size={13} />{shot.video ? 'Prompt' : 'Belum ada'}</button></td>
            <td><button type="button" className="shot-table-open" aria-haspopup="dialog" aria-label={`Buka prompt Shot ${shot.number}: ${shot.title}`} onClick={e => { e.stopPropagation(); open(); }}>Buka<ArrowRight size={13} /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <dialog ref={dialog} className="shot-dialog" aria-labelledby={labelId} onClose={() => setSelectedNumber(null)} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {selected && <div className="shot-dialog-layout"><header className="shot-dialog-header"><div className="agent-avatar"><Clapperboard size={20} /></div><div><span>PROMPT PRODUKSI{selected.duration ? ` · ${selected.duration} DETIK` : ''}</span><h2 id={labelId}>Shot {selected.number}</h2><p>{selected.title}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Tutup prompt shot"><X size={20} /></button></header>
        <div className="shot-tabs" role="tablist" aria-label="Jenis prompt" onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); const tabs: Tab[] = ['image', 'video', 'dialogue', ...(selected.notes ? ['notes' as const] : [])];
          const index = tabs.indexOf(tab); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setTab(tabs[next]); document.getElementById(`${tabId}-${tabs[next]}`)?.focus();
        }}>{([{ id: 'image', label: 'Nano Banana Pro', sub: 'Image keyframe', icon: Image }, { id: 'video', label: 'Omni Flash', sub: 'Video prompt', icon: Film }, { id: 'dialogue', label: 'Dialog', sub: 'Edit ucapan karakter', icon: MessageText }, ...(selected.notes ? [{ id: 'notes', label: 'Catatan shot', sub: 'Blocking & continuity', icon: Clapperboard }] : [])] as const).map(item => <button type="button" role="tab" id={`${tabId}-${item.id}`} aria-selected={tab === item.id} aria-controls={`${tabId}-panel`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id as Tab)}><item.icon size={16} /><span>{item.label}<small>{item.sub}</small></span></button>)}</div>
        <section className="shot-prompt-panel" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} tabIndex={0}>
          <div hidden={tab !== 'dialogue'}><DialogueEditor key={`${messageId}:${selected.number}`} shot={selected} messageId={messageId} messageContent={messageContent} /></div>
          {tab !== 'dialogue' && <><div className="shot-prompt-label"><span>{tab === 'image' ? 'NANO BANANA PRO — IMAGE KEYFRAME' : tab === 'video' ? 'OMNI FLASH — VIDEO PROMPT' : 'CATATAN SHOT'}{selected.timeRange ? ` · ${selected.timeRange}` : ''}</span>{prompt && <CopyButton text={promptCopyText(prompt)} label={tab === 'notes' ? 'Salin catatan' : 'Salin prompt'} />}</div>{prompt ? <>{(tab === 'image' || tab === 'video') && <GenerateActions key={`${selected.number}-${tab}`} kind={tab} prompt={prompt} messageId={messageId} targetId={`shot:${selected.number}`} />}<div className="markdown"><Markdown content={prompt} /></div></> : <div className="shot-missing"><Clapperboard size={25} /><p>Prompt {tab === 'image' ? 'Nano Banana Pro' : 'Omni Flash'} belum ada dalam jawaban ini.</p><span>Minta Drado melengkapi prompt untuk Shot {selected.number} lewat percakapan.</span></div>}</>}
        </section>
        <footer className="shot-dialog-footer"><span>{tab === 'image' ? 'Generate image memakai engine yang dipilih pada proyek.' : tab === 'video' ? 'Generate video memakai Gemini Omni Flash dan keyframe shot ini.' : tab === 'dialogue' ? 'Dialog tersimpan digunakan pada generate berikutnya.' : 'Pertahankan kontinuitas antarshot.'}</span><button type="button" onClick={close}>Selesai</button></footer>
      </div>}
    </dialog>
  </section>;
}

export function DirectorOutput({ content, messageId = '' }: { content: string; messageId?: string }) {
  const parts = useMemo(() => parseShotOutput(content), [content]);
  type Group = { type: 'markdown'; content: string } | { type: 'shots'; shots: Shot[] } | { type: 'assets'; assets: MasterAsset[] };
  const groups: Group[] = [];
  for (const part of parts) {
    if (part.type === 'shot') {
      const last = groups.at(-1);
      if (last?.type === 'shots') last.shots.push(part.shot);
      else groups.push({ type: 'shots', shots: [part.shot] });
    } else for (const master of parseMasterAssets(part.content)) {
      if (master.type === 'markdown') { if (master.content.trim()) groups.push(master); }
      else {
        const last = groups.at(-1);
        if (last?.type === 'assets') last.assets.push(master.asset);
        else groups.push({ type: 'assets', assets: [master.asset] });
      }
    }
  }
  return <>{groups.map((group, i) => group.type === 'shots' ? <ShotTable key={i} shots={group.shots} messageId={messageId} messageContent={content} /> : group.type === 'assets' ? <MasterAssetsTable key={i} assets={group.assets} messageId={messageId} /> : group.content.length > 1200 && groups.some(g => g.type !== 'markdown') && !/\n[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\|/.test(group.content) ? <details className="shot-supporting-notes" key={i}><summary><Clapperboard size={15} /><span>Catatan produksi</span><ChevronRight size={15} /></summary><div className="markdown"><Markdown content={group.content} /></div></details> : <div className="markdown" key={i}><Markdown content={group.content} /></div>)}</>;
}
