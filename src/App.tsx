import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, DocumentDownload as ArrowDownToLine, ArrowRight, ArrowDown2 as ChevronDown, ArrowRight2 as ChevronRight, VideoPlay as Clapperboard, VideoSquare as Film, FolderOpen, Refresh2 as LoaderCircle, HamburgerMenu as Menu, MessageText as MessageSquare, More as MoreHorizontal, SidebarRight as PanelRightClose, SidebarLeft as PanelRightOpen, Edit2 as Pencil, Add as Plus, Refresh as RefreshCw, SearchNormal1 as Search, Send2 as Send, ShieldTick as ShieldCheck, Stop as Square, Trash as Trash2, People as Users, CloseCircle as X, Logout } from 'iconsax-reactjs';
import { api, defaultEngines, json } from './drado-api';
import type { EngineCatalog, Engines, Lighting, Message, Session, SessionSummary } from './drado-api';
import { MessageActions } from './MessageActions';
import { DirectorOutput } from './ShotOutput';
import { MediaProvider } from './media';
import { AssetLibrary } from './AssetLibrary';
import { GeminiUsage } from './GeminiUsage';
import { HermesSkills } from './HermesSkills';
import { EnginePicker } from './EnginePicker';
import { LightingPicker } from './LightingPicker';
import { lightingOptions } from './lighting-options';
import { useAuth } from './AuthGate';
import './styles.css';

const STARTERS = [
  { icon: Clapperboard, title: 'Mulai microdrama', text: 'Dari satu ide, jadi rangkaian shot.', prompt: 'Buat microdrama perselingkuhan di hotel, istri memergoki suami dengan wanita lain.' },
  { icon: Users, title: 'Desain karakter', text: 'Bangun wajah, busana, dan suara.', prompt: 'Buat master karakter Rania, perempuan Indonesia dewasa berhijab krem, kulit cerah alami, hidung mancung. Sertakan voice profile yang diusulkan.' },
  { icon: Film, title: 'Buat prompt shot', text: 'Keyframe image + prompt video.', prompt: 'Bantu buat pasangan prompt Nano Banana Pro IMAGE dan Omni Flash VIDEO untuk satu shot. ' },
  { icon: ShieldCheck, title: 'Perbaiki continuity', text: 'Rapikan eyeline, properti, dan akting.', prompt: 'Bantu perbaiki prompt saya berikut, terutama eyeline pembicara, kontinuitas properti, warna, dan speaker lock:\n\n' },
];
const dateLabel = (value: string) => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
function stored(key: string) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function store(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Browser storage may be unavailable. */ } }


export default function App() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [activeId, setActiveId] = useState(() => stored('morai.drado.active'));
  const [draft, setDraft] = useState(() => stored(`morai.drado.draft.${stored('morai.drado.active') || 'new'}`));
  const [connected, setConnected] = useState(false);
  const [engineCatalog, setEngineCatalog] = useState<EngineCatalog | null>(null);
  const [engineSaving, setEngineSaving] = useState(false);
  const [lightingSaving, setLightingSaving] = useState(false);
  const [draftLighting, setDraftLighting] = useState<Lighting>(() => {
    const saved = stored('morai.drado.lighting.new');
    return lightingOptions.find(option => option.id === saved)?.id || 'drama';
  });
  const engineLock = useRef(false);
  const [preferredEngines, setPreferredEngines] = useState<Engines>(() => {
    try { const saved = JSON.parse(stored('drado.engines')); if (['hermes', 'gemini'].includes(saved?.script) && ['hermes', 'gemini'].includes(saved?.image)) return saved; } catch { /* Use defaults for new projects. */ }
    return { ...defaultEngines };
  });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [context, setContext] = useState(() => window.innerWidth > 1020);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cast, setCast] = useState(() => stored(`morai.drado.cast.${stored('morai.drado.active') || 'new'}`) || 'ask');
  const [draftEpisodes, setDraftEpisodes] = useState(() => stored(`morai.drado.episodes.${stored('morai.drado.active') || 'new'}`) || '1');
  const [format, setFormat] = useState('9:16');
  const [flow, setFlow] = useState('once');
  const [showOptions, setShowOptions] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(activeId);
  const sendLock = useRef(false);
  const busy = session?.status === 'running';
  const engines = session ? session.engines || defaultEngines : preferredEngines;
  const lighting = session ? session.lighting || 'auto' : draftLighting;
  const ready = Boolean(engineCatalog?.script.find(engine => engine.id === engines.script)?.available);
  const messages = session?.messages || [];
  const storyboard = session?.messages.length ? session.workflow === 'storyboard' : cast === 'storyboard';
  const episodeCount = Number(draftEpisodes);
  const validEpisodes = Number.isInteger(episodeCount) && episodeCount >= 1 && episodeCount <= 100;
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  const refreshList = useCallback(async () => {
    const data = await api<{ sessions: SessionSummary[] }>('/sessions'); setSessions(data.sessions);
  }, []);
  const checkConnection = useCallback(async () => {
    try {
      const data = await api<EngineCatalog>('/engines'); setConnected(true); setEngineCatalog(data);
      await refreshList();
    } catch { setConnected(false); }
  }, [refreshList]);
  useEffect(() => { void checkConnection(); const timer = setInterval(checkConnection, 15000); return () => clearInterval(timer); }, [checkConnection]);
  useEffect(() => { selectedRef.current = activeId; store('morai.drado.active', activeId); }, [activeId]);
  useEffect(() => { store(`morai.drado.draft.${activeId || 'new'}`, draft); }, [draft, activeId]);
  useEffect(() => { store(`morai.drado.cast.${activeId || 'new'}`, cast); }, [cast, activeId]);
  useEffect(() => { store(`morai.drado.episodes.${activeId || 'new'}`, draftEpisodes); }, [draftEpisodes, activeId]);
  useEffect(() => {
    if (!activeId) { setSession(null); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    api<{ session: Session }>(`/sessions/${activeId}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setSession(current => current?.id === data.session.id && current.updatedAt >= data.session.updatedAt ? current : data.session);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeId]);
  useEffect(() => {
    if (!activeId || !busy) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await api<{ session: Session }>(`/sessions/${activeId}`);
        if (cancelled || selectedRef.current !== activeId) return;
        setSession(current => current?.id === data.session.id && current.updatedAt > data.session.updatedAt ? current : data.session); setError(''); setConnected(true);
        if (data.session.status !== 'running') void refreshList();
      } catch (err) { if (!cancelled) setError((err as Error).message); }
    }, 1800);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeId, busy, refreshList]);
  useEffect(() => {
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy, atBottom]);
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 200)}px`; }
  }, [draft]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('project-search')?.focus(); setSidebar(true); } }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, []);
  useEffect(() => {
    function dismiss(e: KeyboardEvent) {
      if (e.key === 'Escape') { setRename(false); setDeleteOpen(false); setMenu(false); setShowOptions(false); setSidebar(false); }
    }
    window.addEventListener('keydown', dismiss); return () => window.removeEventListener('keydown', dismiss);
  }, []);

  function selectSession(id: string) {
    if (sending || engineLock.current) return;
    if (id && id === activeId) { setSidebar(false); setMenu(false); return; }
    setCast(stored(`morai.drado.cast.${id || 'new'}`) || 'ask');
    setDraftEpisodes(stored(`morai.drado.episodes.${id || 'new'}`) || '1');
    selectedRef.current = id; setSession(null); setActiveId(id); setDraft(stored(`morai.drado.draft.${id || 'new'}`)); setError(''); setSidebar(false); setMenu(false); setAtBottom(true);
  }
  function newProject() { if (sending || engineLock.current) return; store('morai.drado.draft.new', ''); selectSession(''); setCast('ask'); setDraftEpisodes('1'); setFormat('9:16'); setFlow('once'); setDraftLighting('drama'); store('morai.drado.lighting.new', 'drama'); inputRef.current?.focus(); }
  async function send(override?: string, retry = false) {
    const text = (override ?? draft).trim();
    if ((!text && !retry) || busy || sendLock.current || loading || engineLock.current) return;
    if (!retry && !messages.length && storyboard && !validEpisodes) { setError('Isi jumlah episode dengan bilangan bulat 1–100.'); return; }
    const storyboardOptions = cast === 'storyboard' ? { workflow: 'storyboard' as const, storyboardEpisodes: episodeCount } : { workflow: 'default' as const };
    sendLock.current = true; setSending(true); setError(''); setAtBottom(true);
    let target = session;
    try {
      if (!target) {
        const created = await api<{ session: Session }>('/sessions', json({ engines, lighting, ...storyboardOptions })); target = created.session;
        store('morai.drado.draft.new', '');
        selectedRef.current = target.id; setActiveId(target.id); setSession(target);
        // Keep the draft recoverable if submitting the new session fails.
        store(`morai.drado.draft.${target.id}`, text);
      }
      const isFirst = target.messages.length === 0;
      const settings = isFirst ? [
        format !== '9:16' ? `Format ${format}.` : '',
        cast === 'auto' ? 'Casting: langsung otomatis, lanjutkan master asset dan shot tanpa pertanyaan casting lagi.' : cast === 'custom' ? 'Casting: Custom, gunakan deskripsi karakter saya atau minta deskripsi singkat yang belum ada.' : cast === 'mixed' ? 'Casting: Campuran, gunakan karakter yang saya tentukan dan desain otomatis sisanya.' : '',
        flow === 'reuse' ? 'FLOW REUSE CHIPS: body only tanpa REFERENCES. Chip sudah saya pilih di editor Flow.' : '',
      ].filter(Boolean).join('\n') : '';
      const content = settings ? `${text}\n\n${settings}` : text;
      const data = await api<{ session: Session }>(`/sessions/${target.id}/messages`, json(retry ? { retry: true } : { content, ...(isFirst ? { ...storyboardOptions } : {}) }));
      if (selectedRef.current === target.id) { setSession(data.session); setDraft(''); store(`morai.drado.draft.${target.id}`, ''); }
      await refreshList();
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); sendLock.current = false; }
  }
  async function updateEngines(next: Engines) {
    if (engineLock.current) return;
    engineLock.current = true; setEngineSaving(true);
    try {
      if (session) {
        const projectId = session.id;
        const data = await api<{ session: Session }>(`/sessions/${projectId}`, { method: 'PATCH', body: JSON.stringify({ engines: next }) });
        if (selectedRef.current === projectId) setSession(data.session);
        void refreshList();
      }
      setPreferredEngines(next); store('drado.engines', JSON.stringify(next));
    } finally { engineLock.current = false; setEngineSaving(false); }
  }
  async function updateLighting(next: Lighting) {
    if (engineLock.current) return;
    engineLock.current = true; setLightingSaving(true); setError('');
    try {
      if (session) {
        const projectId = session.id;
        const data = await api<{ session: Session }>(`/sessions/${projectId}`, { method: 'PATCH', body: JSON.stringify({ lighting: next }) });
        if (selectedRef.current === projectId) setSession(data.session);
        void refreshList();
      } else {
        setDraftLighting(next); store('morai.drado.lighting.new', next);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan lighting.'); }
    finally { engineLock.current = false; setLightingSaving(false); }
  }
  async function stop() {
    if (!session) return;
    try { await api(`/sessions/${session.id}/cancel`, json({})); } catch (err) { setError((err as Error).message); }
  }
  async function saveTitle() {
    if (!session || !title.trim()) return;
    try {
      const data = await api<{ session: Session }>(`/sessions/${session.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setSession(data.session); setRename(false); await refreshList();
    } catch (err) { setError((err as Error).message); }
  }
  async function removeProject() {
    if (!session) return;
    try { await api(`/sessions/${session.id}`, { method: 'DELETE' }); store(`morai.drado.draft.${session.id}`, ''); setDeleteOpen(false); newProject(); await refreshList(); }
    catch (err) { setError((err as Error).message); }
  }
  function download() {
    if (!session) return;
    const content = `# ${session.title}\n\n${messages.map(m => `## ${m.role === 'user' ? 'Kamu' : 'Drado'}\n\n${m.content}`).join('\n\n---\n\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${session.title.replace(/[^a-z0-9 -]/gi, '').slice(0, 60) || 'drado-project'}.md`; a.click(); URL.revokeObjectURL(url);
  }
  function fill(prompt: string) { setDraft(prompt); inputRef.current?.focus(); }
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError('');
    try { await logout(); }
    catch { setLogoutError('Gagal keluar. Periksa koneksi dan coba kembali.'); }
    finally { setLoggingOut(false); }
  }

  return <MediaProvider sessionId={activeId} imageEngine={engines.image} onMessageDeleted={(updated, messageId) => {
    if (selectedRef.current === updated.id) setSession(current => current?.id === updated.id ? {
      ...current,
      ...(current.updatedAt <= updated.updatedAt ? { updatedAt: updated.updatedAt, status: updated.status, error: updated.error } : {}),
      messages: current.messages.filter(message => message.id !== messageId),
    } : current);
    void refreshList();
  }} onMessageUpdated={(message, projectId, updatedAt) => {
    if (selectedRef.current === projectId) setSession(current => current?.id === projectId ? { ...current, updatedAt, messages: current.messages.map(entry => entry.id === message.id ? message : entry) } : current);
    void refreshList();
  }}><div className={`studio ${context ? '' : 'without-context'}`}>
    {sidebar && <button className="sidebar-backdrop" aria-label="Tutup navigasi" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
      <a className="brand" href="/" onClick={e => { e.preventDefault(); newProject(); }} aria-label="DRADO AI beranda"><div className="brand-mark"><Clapperboard size={23} /></div><div>DRADO AI<span>DIRECTOR STUDIO</span></div></a>
      <button className="new-project" onClick={newProject} disabled={sending}><span className="new-project-label">Proyek baru</span><Plus size={17} className="new-project-plus" /></button>
      <label className="search"><Search size={15} /><input id="project-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari proyek" aria-label="Cari proyek" /><kbd>⌘ K</kbd></label>
      <div className="section-label">WORKSPACE <span>{sessions.length.toString().padStart(2, '0')}</span></div>
      <nav className="project-list" aria-label="Riwayat proyek">
        {sessions.filter(s => s.title.toLowerCase().includes(search.toLowerCase())).map(s => <button key={s.id} className={`project-item ${s.id === activeId ? 'active' : ''}`} onClick={() => selectSession(s.id)} disabled={sending}>
          {s.status === 'running' ? <LoaderCircle size={16} className="spin" /> : <MessageSquare size={16} />}<span>{s.title}<small>{dateLabel(s.updatedAt)} · {s.messageCount} pesan</small></span>{s.status === 'error' && <span className="error-dot" />}
        </button>)}
        {!sessions.length && <div className="empty-projects"><FolderOpen size={23} /><p>Ruang untuk cerita berikutnya.</p><span>Proyekmu akan tersimpan di sini.</span></div>}
        {search && sessions.length > 0 && !sessions.some(s => s.title.toLowerCase().includes(search.toLowerCase())) && <p className="no-results">Proyek tidak ditemukan.</p>}
      </nav>
      <div className="sidebar-bottom"><GeminiUsage />
      <div className="profile"><div className="avatar">D</div><div>DRADO workspace<small>{user?.username || 'Administrator'}</small></div><button type="button" className="profile-logout" aria-label="Keluar dari DRADO AI" title="Keluar" disabled={loggingOut} onClick={() => void handleLogout()}><Logout size={16} /></button></div>{logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}</div>
    </aside>

    <main className="main-panel">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Buka navigasi" onClick={() => setSidebar(true)}><Menu size={19} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{session?.title || 'Proyek baru'}</strong></div><div className="topbar-actions"><HermesSkills lastMessage={lastAssistant} scriptEngine={engines.script} lighting={lighting} /><EnginePicker key={activeId || 'new'} value={engines} catalog={engineCatalog} disabled={Boolean(busy || sending || loading || lightingSaving)} saving={engineSaving} onChange={updateEngines} /><span className="private-badge"><ShieldCheck size={13} /> Tersimpan lokal</span>{session && <div className="menu-wrap"><button className="icon-button" aria-label="Menu proyek" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={19} /></button>{menu && <><button className="menu-backdrop" aria-label="Tutup menu" onClick={() => setMenu(false)} /><div className="dropdown"><button onClick={() => { setTitle(session.title); setRename(true); setMenu(false); }}><Pencil size={14} /> Ubah nama</button><button onClick={() => { download(); setMenu(false); }}><ArrowDownToLine size={14} /> Ekspor Markdown</button><button className="danger" disabled={busy} onClick={() => { setDeleteOpen(true); setMenu(false); }}><Trash2 size={14} /> Hapus proyek</button></div></>}</div>}<button className="icon-button" aria-label={context ? 'Tutup library aset' : 'Buka library aset'} aria-pressed={context} onClick={() => setContext(!context)}>{context ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button></div></header>
      <div className="chat-scroll" ref={scrollRef} onScroll={e => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120); }}>
        {!messages.length && !loading ? <div className="welcome">
          <div className="agent-badge"><span className="status-dot online" /> DRADO AGENT <span className="badge-divider" /> VISUAL DIRECTOR</div>
          <div className="welcome-symbol"><Clapperboard size={34} /></div>
          <h1>Setiap cerita hebat<br />dimulai dari <em>satu ide.</em></h1>
          <p className="welcome-description">Ceritakan idemu. Drado menyusun karakter, dunia cerita, dan<br className="desktop-break" /> prompt sinematik yang siap kamu bawa ke Google Flow.</p>
          <div className="welcome-pipeline"><span>Ide cerita</span><ArrowRight size={13} /><span>Master asset</span><ArrowRight size={13} /><span>Image</span><ArrowRight size={13} /><span>Video prompt</span></div>
          <div className="starter-grid">{STARTERS.map(item => <button key={item.title} className="starter-card" onClick={() => fill(item.prompt)}><item.icon size={19} /><strong>{item.title}</strong><p>{item.text}</p><ArrowRight size={14} className="starter-arrow" /></button>)}</div>
          <div className="example-idea"><span>COBA IDE INI</span><button onClick={() => fill(STARTERS[0].prompt)}>“Istri memergoki suaminya bersama wanita lain di hotel.” <ArrowUpRightIcon /></button></div>
        </div> : <div className="conversation">
          {loading && <div className="loading-state"><LoaderCircle size={20} className="spin" /> Memuat percakapan…</div>}
          {!loading && messages.map((message: Message) => <article key={message.id} className={`message ${message.role}`}>
            {message.role === 'assistant' && <div className="message-heading"><div className="agent-avatar"><Clapperboard size={17} /></div><strong>Drado</strong><span>DIRECTOR</span><time>{new Date(message.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time></div>}
            {message.role === 'user' ? <div className="user-bubble">{message.content}</div> : <DirectorOutput content={message.content} messageId={message.id} />}
            <MessageActions message={message} busy={Boolean(busy || sending || engineSaving)} />
          </article>)}
          {!loading && busy && <div className="thinking" role="status"><div className="agent-avatar"><Clapperboard size={17} /></div><div><strong>Drado sedang menyusun jawaban<span className="thinking-dots">…</span></strong><p>Menjaga cerita, karakter, dan kontinuitas. Kamu bisa berpindah proyek.</p></div></div>}
          {!loading && session?.status === 'error' && <div className="error-card" role="alert"><p>{session.error}</p><button className="text-button" onClick={() => void send(undefined, true)} disabled={sending}><RefreshCw size={14} /> Coba ulang pesan terakhir</button></div>}
          {!loading && lastAssistant && !busy && <div className="followups">{['Lanjutkan ke tahap berikutnya', 'Buat catatan produksi dalam tabel', 'FLOW @ ONCE: tampilkan prompt siap salin', 'Periksa kontinuitas shot terakhir'].map(text => <button key={text} onClick={() => fill(text)}>{text}<ArrowRight size={12} /></button>)}</div>}
        </div>}
      </div>
      {!atBottom && messages.length > 0 && <button className="jump-bottom icon-button" aria-label="Ke pesan terbaru" onClick={() => { setAtBottom(true); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }}><ArrowDown size={17} /></button>}
      <div className="composer-area">
        {error && <div className="inline-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Tutup pesan kesalahan" onClick={() => setError('')}><X size={14} /></button></div>}
        {!connected && <div className="connection-note"><span className="status-dot" /><span>Backend belum terhubung. Jalankan <code>npm run backend</code>.</span><button onClick={() => { setError(''); void checkConnection(); }} aria-label="Cek ulang koneksi"><RefreshCw size={13} /></button></div>}
        {connected && !ready && <div className="inline-error" role="alert">{engines.script === 'gemini' ? 'Gemini API key atau skill Drado belum tersedia. Periksa konfigurasi backend.' : 'Hermes atau skill drado-agent belum ditemukan. Periksa konfigurasi backend.'}</div>}
        {!messages.length && <div className="cast-row"><span>CASTING</span>{[{ value: 'ask', label: 'Tanya Drado' }, { value: 'auto', label: 'Auto' }, { value: 'custom', label: 'Custom' }, { value: 'mixed', label: 'Campuran' }, { value: 'storyboard', label: 'Storyboard' }].map(item => <button key={item.value} className={cast === item.value ? 'selected' : ''} disabled={loading || sending || busy} onClick={() => { setCast(item.value); inputRef.current?.focus(); }} aria-pressed={cast === item.value}>{item.label}</button>)}</div>}
        {storyboard && !messages.length && <div className="storyboard-options"><label htmlFor="storyboard-episodes">Mau berapa episode?</label><input id="storyboard-episodes" type="number" min={1} max={100} step={1} value={draftEpisodes} disabled={loading || sending || busy} onChange={event => setDraftEpisodes(event.target.value)} aria-describedby="storyboard-note" aria-invalid={!validEpisodes} /><span>episode · 80 detik per episode</span></div>}
        {storyboard && <p id="storyboard-note" className="storyboard-note">{messages.length ? `Mode Storyboard aktif · ${session?.storyboardEpisodes || 1} episode · referensi 5 panel + prompt Omni T2V.` : 'Pilih jumlah episode, lalu masukkan judul. Hermes menyusun cast, master asset, storyboard, serta alur dan bridging antar-episode otomatis.'}</p>}
        <form className={`composer ${busy ? 'is-busy' : ''}`} onSubmit={e => { e.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="message-input">{!messages.length && storyboard ? 'Judul storyboard' : 'Pesan untuk Drado'}</label><textarea id="message-input" aria-describedby={storyboard ? 'storyboard-note' : undefined} ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} maxLength={12000} rows={2} placeholder={messages.length ? 'Lanjutkan cerita, revisi shot, atau tempel prompt untuk diperbaiki…' : storyboard ? 'Masukkan judul ceritamu, contoh: Rahasia di Balik Pernikahan…' : 'Tulis ide ceritamu dalam satu kalimat…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} disabled={loading} />
          <div className="composer-toolbar"><div className="composer-tools"><span className="composer-agent">Drado<span className="tiny-dot" />Agent</span>{!messages.length && <div className="options-wrap"><button type="button" className="format-button" aria-expanded={showOptions} onClick={() => setShowOptions(!showOptions)}>{format}<ChevronDown size={12} /></button>{showOptions && <div className="composer-options"><label>Format frame<select value={format} onChange={e => setFormat(e.target.value)}><option value="9:16">9:16 · Vertikal</option><option value="16:9">16:9 · Horizontal</option></select></label><label>Referensi Google Flow<select value={flow} onChange={e => setFlow(e.target.value)}><option value="once">@ sekali per asset</option><option value="reuse">Reuse chips · body only</option></select></label><small>Reuse chips untuk aset yang sudah dipilih di editor Flow.</small></div>}</div>}<LightingPicker value={lighting} disabled={Boolean(busy || sending || loading || engineSaving || (activeId && !session))} saving={lightingSaving} onChange={next => void updateLighting(next)} /></div><div className="send-tools"><span>{draft.length > 11000 ? `${draft.length}/12.000` : '↵ untuk kirim'}</span>{busy ? <button type="button" className="stop-button" aria-label="Hentikan proses" onClick={() => void stop()}><Square size={14} fill="currentColor" /></button> : <button type="submit" className="send-button" disabled={!draft.trim() || sending || loading || engineSaving || lightingSaving || !connected || !ready} aria-label="Kirim pesan">{sending ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={19} />}</button>}</div></div>
        </form><p className="lighting-note">Lighting & gaya: {lightingOptions.find(option => option.id === lighting)?.description}{messages.length > 0 && lighting !== 'auto' ? ' Berlaku pada prompt baru dan revisi berikutnya.' : ''}</p><p className="composer-footnote">Drado menyusun prompt. Generate gambar dan video langsung melalui Gemini API.<span>Shift + Enter untuk baris baru</span></p>
      </div>
    </main>

    {context && <AssetLibrary messages={messages} onClose={() => setContext(false)} />}

    {(rename || deleteOpen) && <div className="modal-backdrop" onClick={() => { setRename(false); setDeleteOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="icon-button modal-close" aria-label="Tutup dialog" onClick={() => { setRename(false); setDeleteOpen(false); }}><X size={18} /></button><h2 id="modal-title">{rename ? 'Ubah nama proyek' : 'Hapus proyek ini?'}</h2>{rename ? <form onSubmit={e => { e.preventDefault(); void saveTitle(); }}><label>Nama proyek<input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={100} /></label><button type="submit" className="primary-button" disabled={!title.trim()}>Simpan nama</button></form> : <><p>Percakapan “{session?.title}” akan dihapus dari workspace. Ekspor dahulu jika masih diperlukan.</p><div className="modal-actions"><button className="text-button" onClick={() => setDeleteOpen(false)}>Batal</button><button className="primary-button delete-button" onClick={() => void removeProject()}>Hapus proyek</button></div></>}</section></div>}
  </div></MediaProvider>;
}
function ArrowUpRightIcon() { return <Send size={12} />; }
