import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown2, ArrowRight, CloseCircle, Gallery, VideoPlay } from 'iconsax-reactjs';
import { api } from './drado-api';
import { mediaUrl, useMedia } from './media';
import type { MediaJob } from './media';
import { costLabel, totalLabel } from './cost';
import type { CostTotal, MediaCost } from './cost';

type Counts = { total: number; completed: number; failed: number; running: number; cost?: CostTotal };
type UsageJob = MediaJob & { sessionId: string; projectTitle: string };
type Usage = { image: Counts; video: Counts; jobs: UsageJob[]; cost?: CostTotal };
const statusLabel = { running: 'Diproses', completed: 'Selesai', failed: 'Gagal' };
const dateLabel = (value: string) => new Date(value).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function CostDetails({ cost }: { cost?: MediaCost }) {
  if (!cost || cost.status !== 'estimated') return <><span className="usage-cost-missing">{costLabel(cost)}</span>{cost?.status !== 'pending' && cost?.note && <small>{cost.note}</small>}</>;
  return <details className="usage-cost-details"><summary>{costLabel(cost)}</summary><div>
    <p>Estimasi dari usage API</p>
    <p>Input: {cost.usage?.inputTokens?.toLocaleString('id-ID') ?? '—'} token</p>
    <p>Output: {cost.usage?.outputTokens?.toLocaleString('id-ID') ?? '—'} token</p>
    {cost.usage?.outputByModality && Object.entries(cost.usage.outputByModality).map(([modality, tokens]) => <p key={modality}>{modality}: {tokens.toLocaleString('id-ID')} token</p>)}
    {Boolean(cost.usage?.thinkingTokens) && <p>Thinking: {cost.usage!.thinkingTokens!.toLocaleString('id-ID')} token</p>}
    {cost.pricing && <><p>Tarif per 1 juta token (USD): input ${cost.pricing.inputUsdPerMillion}; text/thinking ${cost.pricing.textOutputUsdPerMillion}; media ${cost.pricing.mediaOutputUsdPerMillion}.</p><p>Tarif dicatat: {new Date(cost.pricing.checkedAt).toLocaleDateString('id-ID')}</p>{cost.pricing.source.startsWith('https://ai.google.dev/') ? <a href={cost.pricing.source} target="_blank" rel="noreferrer">Harga resmi Google</a> : <p>{cost.pricing.source}</p>}</>}
  </div></details>;
}

export function GeminiUsage() {
  const { jobs } = useMedia();
  const changes = jobs.map(job => `${job.id}:${job.status}`).join('|');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Usage>('/media/usage', { signal: controller.signal });
        if (!controller.signal.aborted) { setUsage(data); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('Riwayat belum tersedia. Periksa koneksi atau restart backend.');
      } finally { pending = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), open ? 5000 : 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [changes, open]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  const recent = usage?.jobs.filter(job => filter === 'all' || job.kind === filter) || [];
  const total = usage ? usage.image.total + usage.video.total : undefined;
  const selectedCost = filter === 'all' ? usage?.cost : usage?.[filter].cost;
  const selectedCount = filter === 'all' ? total : usage?.[filter].total;
  return <>
    <section className="gemini-usage" aria-label="Penggunaan Gemini">
      <details className="usage-disclosure">
      <summary className="usage-heading"><strong>Gemini usage</strong><span>WORKSPACE</span><ArrowDown2 className="usage-toggle" size={14} aria-hidden="true" /></summary>
      <div className="usage-disclosure-body">
      <div className="usage-cost-total"><span>Estimasi biaya tercatat · USD</span><strong>{totalLabel(usage?.cost, total)}</strong>{Boolean(usage?.cost?.unpriced) && <small>{usage!.cost!.unpriced} generasi belum terhitung</small>}</div>
      <div className="usage-counts">{(['image', 'video'] as const).map(kind => <div key={kind}>
        <span>{kind === 'image' ? <Gallery size={14} /> : <VideoPlay size={14} />}{kind === 'image' ? 'Image' : 'Video'}</span>
        <strong>{usage ? usage[kind].total.toLocaleString('id-ID') : '—'}</strong>
        <small>{usage ? `${usage[kind].completed} selesai` : 'Memuat…'}</small>
        <small className="usage-kind-cost">{totalLabel(usage?.[kind].cost, usage?.[kind].total)}</small>
      </div>)}</div>
      {error && <p className="usage-error" role="status">{error}</p>}
      <button type="button" className="usage-history-button" onClick={() => setOpen(true)} aria-haspopup="dialog">Riwayat penggunaan<ArrowRight size={14} /></button>
      </div>
      </details>
    </section>
    <dialog ref={dialog} className="shot-dialog usage-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="shot-dialog-layout">
        <header className="shot-dialog-header"><div><span>GEMINI API</span><h2 id={titleId}>Riwayat penggunaan</h2><p>Generasi image dan video melalui Gemini dari seluruh proyek.</p></div><button type="button" className="icon-button" aria-label="Tutup riwayat" onClick={() => dialog.current?.close()}><CloseCircle size={20} /></button></header>
        <div className="master-variants" aria-label="Filter riwayat">{(['all', 'image', 'video'] as const).map(kind => <button type="button" key={kind} className={filter === kind ? 'active' : ''} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? 'Semua' : kind === 'image' ? 'Image' : 'Video'}</button>)}</div>
        <div className="usage-history-body">
          <div className="usage-cost-summary"><div><span>Estimasi {filter === 'all' ? 'total' : filter} · USD</span><strong>{totalLabel(selectedCost, selectedCount)}</strong></div><p>{selectedCost?.priced ?? 0} generasi terhitung{Boolean(selectedCost?.unpriced) && ` / ${selectedCost!.unpriced} belum tercatat`}{Boolean(selectedCost?.pending) && ` / ${selectedCost!.pending} menunggu usage`}</p></div>
          {error && <p className="usage-error" role="status">{error}</p>}
          {recent.length ? <div className="shot-table-scroll"><table className="shot-table usage-table"><caption className="sr-only">50 generasi terbaru dalam workspace beserta estimasi biaya USD</caption><thead><tr><th scope="col">Waktu / Proyek</th><th scope="col">Jenis / Model</th><th scope="col">Status</th><th scope="col">Estimasi biaya (USD)</th><th scope="col">Hasil</th></tr></thead><tbody>{recent.map(job => <tr key={job.id}>
            <td><time dateTime={job.createdAt}>{dateLabel(job.createdAt)}</time><strong>{job.projectTitle}</strong><small>{job.assetId || job.targetId.replace(/^shot:/, 'Shot ')}</small></td>
            <td><span className="usage-kind">{job.kind === 'image' ? <Gallery size={14} /> : <VideoPlay size={14} />}{job.kind === 'image' ? 'Image' : 'Video'}</span><small>{job.model}{job.imageSize ? ` · ${job.imageSize}` : ''}</small></td>
            <td><span className={`usage-status ${job.status}`}>{statusLabel[job.status]}</span>{job.error && <small className="usage-job-error">{job.error}</small>}</td>
            <td><CostDetails cost={job.cost} /></td>
            <td>{job.url ? <a className="shot-table-prompt" href={mediaUrl(job.url)} target="_blank" rel="noreferrer">Lihat<ArrowRight size={12} /></a> : <span>—</span>}</td>
          </tr>)}</tbody></table></div> : <p className="usage-empty">{usage ? 'Belum ada riwayat generasi untuk kategori ini.' : error ? 'Riwayat belum dapat dimuat.' : 'Memuat riwayat…'}</p>}
        </div>
        <footer className="shot-dialog-footer"><span>Estimasi dari usage API. Belum termasuk pajak, kredit, dan diskon akun.</span><button type="button" onClick={() => dialog.current?.close()}>Selesai</button></footer>
      </div>
    </dialog>
  </>;
}
