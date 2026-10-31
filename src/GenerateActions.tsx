import { useRef, useState } from 'react';
import { Gallery, VideoPlay, Refresh2, DocumentDownload, ArrowDown2 } from 'iconsax-reactjs';
import { useMedia, mediaUrl } from './media';
import { promptCopyText } from './shot-output';
import { costLabel } from './cost';
import { useGenerationSettings } from './generation-settings';
export function GenerateActions({ kind, prompt, messageId, targetId, assetId, showResult = true }: { kind: 'image' | 'video'; prompt: string; messageId: string; targetId: string; assetId?: string; showResult?: boolean }) {
  const media = useMedia(); const lock = useRef(false);
  const fallbackRatio = prompt.match(/\b(?:9:16|16:9|1:1|4:3|3:4)\b/)?.[0] || (assetId ? '1:1' : '9:16');
  const { settings, update } = useGenerationSettings(media.sessionId, messageId, targetId, fallbackRatio, Boolean(assetId));
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const jobs = media.jobs.filter(j => j.messageId === messageId && j.targetId === targetId && j.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result = jobs[0]; const busy = result?.status === 'running' || pending;
  const image = media.jobs.find(j => j.messageId === messageId && j.targetId === targetId && j.kind === 'image' && j.status === 'completed' && j.aspectRatio === settings.aspectRatio);
  async function generate() {
    if (lock.current || busy) return; lock.current = true; setPending(true); setError('');
    const text = promptCopyText(prompt);
    try { await media.generate({ kind, messageId, targetId, assetId, prompt: text, aspectRatio: settings.aspectRatio, ...(kind === 'video' ? { resolution: settings.resolution } : { imageSize: settings.imageSize }) }); }
    catch (err) { setError((err as Error).message); } finally { lock.current = false; setPending(false); }
  }
  return <section className="generate-actions" aria-label={`Generate ${kind}`}><div className="generation-options"><label>Rasio frame<span className="generation-select"><select value={settings.aspectRatio} disabled={busy} onChange={event => update({ aspectRatio: event.target.value })}>{(assetId ? ['1:1', '9:16', '16:9', '4:3', '3:4'] : ['9:16', '16:9']).map(ratio => <option value={ratio} key={ratio}>{ratio}{ratio === '9:16' ? ' · Vertikal' : ratio === '16:9' ? ' · Horizontal' : ''}</option>)}</select><ArrowDown2 size={14} aria-hidden="true" /></span></label>{kind === 'image' && <label>Resolusi gambar<output className="generation-fixed">HD · 1K</output></label>}{kind === 'video' && <label>Resolusi video<span className="generation-select"><select value={settings.resolution} disabled={busy} onChange={event => update({ resolution: event.target.value as '720p' | '1080p' })}><option value="720p">720p</option><option value="1080p">1080p</option></select><ArrowDown2 size={14} aria-hidden="true" /></span></label>}</div><div className="generate-actions-bar"><button type="button" className="generate-button" disabled={busy || !media.sessionId || !prompt.trim() || (kind === 'video' && !image)} onClick={() => void generate()}>{busy ? <Refresh2 size={15} className="spin" /> : kind === 'image' ? <Gallery size={15} /> : <VideoPlay size={15} />}{busy ? 'Generating…' : `Generate ${kind === 'image' ? 'Image' : 'Video'}`}</button><span>{kind === 'image' ? media.imageEngine === 'hermes' ? 'ChatGPT Image via Hermes' : 'Gemini Image API' : 'Gemini Omni Flash API'}</span></div>
    {kind === 'video' && !image && <p className="generate-note">Generate gambar shot dengan rasio {settings.aspectRatio} terlebih dahulu sebagai start frame Omni.</p>}
    {kind === 'video' && image?.url && !result && <div className="generate-anchor"><img src={mediaUrl(image.url)} alt="Start frame shot" /><span>Keyframe shot ini akan dipakai sebagai frame awal video.</span></div>}
    {(error || media.error) && <p className="generate-error" role="alert">{error || media.error}</p>}
    {result?.status === 'running' && <p className="generate-note" role="status">Sedang memproses melalui {result.engine === 'hermes' ? 'Hermes' : 'Gemini API'}. Dialog boleh ditutup; proses tetap berjalan.</p>}
    {result?.status === 'failed' && <p className="generate-error" role="alert">{result.error}</p>}
    {showResult && result?.status === 'completed' && result.url && <div className="generate-result">{kind === 'image' ? <img src={mediaUrl(result.url)} alt={assetId ? `Hasil ${assetId}` : 'Hasil gambar shot'} /> : <video key={result.id} src={mediaUrl(result.url)} controls preload="metadata" playsInline />}<div><span>{result.engine === 'hermes' ? 'Hermes · ' : 'Gemini · '}{result.model}<small className="generate-result-cost">{result.aspectRatio}{kind === 'image' && result.imageSize ? ` · ${result.imageSize === '1K' ? 'HD · 1K' : result.imageSize}` : ''}{result.width && result.height ? ` · ${result.width}×${result.height}` : ''}{result.upscaled ? ' · Upscale' : ''}{kind === 'video' ? ` · ${result.resolution || '720p'}` : ''}</small><small className="generate-result-cost">{result.cost?.status === 'estimated' ? 'Estimasi ' : 'Biaya: '}{costLabel(result.cost)}</small></span><a href={`${mediaUrl(result.url)}?download=1`} download><DocumentDownload size={14} />Unduh {kind === 'image' ? 'gambar' : 'video'}</a></div></div>}
  </section>;
}
