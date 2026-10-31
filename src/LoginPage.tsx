import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { VideoPlay, Eye, EyeSlash, ArrowRight, ShieldTick, Pause, Play } from 'iconsax-reactjs';
import './login.css';

const FEATURES = [
  { label: 'KARAKTER & MASTER ASSET', title: 'Bangun dunia cerita.', description: 'Rancang karakter, busana, lokasi, properti, dan profil suara sebagai acuan yang konsisten di setiap shot.' },
  { label: 'LIGHTING & PENYUTRADARAAN', title: 'Arahkan setiap adegan.', description: 'Susun lighting, kamera, blocking, eyeline, dan ekspresi untuk menghidupkan cerita tanpa kehilangan continuity.' },
  { label: 'STORYBOARD & PRODUKSI', title: 'Dari ide ke setiap shot.', description: 'Siapkan storyboard, edit dialog, lalu buat image keyframe dan video dari prompt produksi tiap shot.' },
];

type Props = { onLogin: (username: string, password: string) => Promise<void>; notice?: string; onRetry: () => void };
export default function LoginPage({ onLogin, notice, onRetry }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [activeFeature, setActiveFeature] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const featureId = useId();
  const lock = useRef(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reducedMotion) return;
    const timer = window.setTimeout(() => setActiveFeature(current => (current + 1) % FEATURES.length), 3000);
    return () => window.clearTimeout(timer);
  }, [activeFeature, paused, hovered, focused, reducedMotion]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setPending(true); setError('');
    try { await onLogin(username.trim(), password); }
    catch (cause) { setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Tidak dapat terhubung ke backend. Coba kembali.'); }
    finally { lock.current = false; setPending(false); }
  }
  return <main className="drado-login-shell"><div className="drado-login-card">
    <section className="drado-login-form-panel">
      <div className="drado-login-brand"><span className="drado-login-mark"><VideoPlay size={27} /></span><div>DRADO AI<small>DIRECTOR STUDIO</small></div></div>
      <div className="drado-login-intro"><span>SELAMAT DATANG KEMBALI</span><h1>Masuk ke studio</h1><p>Lanjutkan cerita, karakter, dan produksi microdrama Anda.</p></div>
      <form onSubmit={event => void submit(event)} className="drado-login-form">
        <label>Username<input name="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} autoFocus disabled={pending} placeholder="Masukkan username" /></label>
        <label>Password<span className="drado-login-password"><input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={1024} disabled={pending} placeholder="Masukkan password" /><button type="button" disabled={pending} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={showPassword}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></span></label>
        {error && <p className="drado-login-error" role="alert">{error}</p>}
        {notice && <div className="drado-login-notice" role="status"><p>{notice}</p><button type="button" disabled={pending} onClick={onRetry}>Coba kembali</button></div>}
        <button type="submit" className="drado-login-submit" disabled={pending || !username.trim() || !password}><span>{pending ? 'Memproses…' : 'Masuk ke DRADO AI'}</span><ArrowRight size={18} /></button>
      </form>
      <footer className="drado-login-footer"><ShieldTick size={14} /><span>DRADO AI · Director Studio</span></footer>
    </section>
    <aside className="drado-login-showcase" role="region" aria-roledescription="carousel" aria-label="Fitur DRADO AI" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="drado-login-studio-label"><VideoPlay size={18} />DRADO AI</div>
      <div className="drado-login-slider" aria-live={paused || hovered || focused || reducedMotion ? 'polite' : 'off'}>
        {FEATURES.map((feature, index) => <section key={feature.label} id={`${featureId}-${index}`} className={`drado-login-slide${index === activeFeature ? ' active' : ''}`} role="group" aria-roledescription="slide" aria-label={`${index + 1} dari ${FEATURES.length}`} aria-hidden={index !== activeFeature}>
          <div className="drado-login-showcase-copy"><span>{feature.label}</span><h2>{feature.title}</h2><p>{feature.description}</p></div>
        </section>)}
      </div>
      <div className="drado-login-feature-controls"><div className="drado-login-feature-pages" aria-label="Pilih fitur">{FEATURES.map((feature, index) => <button key={feature.label} type="button" className={index === activeFeature ? 'active' : ''} aria-label={`Lihat fitur ${feature.label.toLowerCase()}`} aria-controls={`${featureId}-${index}`} aria-current={index === activeFeature ? 'true' : undefined} onClick={() => setActiveFeature(index)}>0{index + 1}</button>)}</div><button className="drado-login-feature-pause" type="button" disabled={reducedMotion} onClick={() => setPaused(current => !current)} aria-label={paused || reducedMotion ? 'Putar pergantian fitur otomatis' : 'Jeda pergantian fitur otomatis'}>{paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}</button></div>
      <span className="drado-login-showcase-footer">MORA TEKNOLOGI INDONESIA</span>
    </aside>
  </div></main>;
}
