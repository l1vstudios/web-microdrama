import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";

const LOGIN_SLIDES = [
    {
        eyebrow: "QA",
        metric: "PASS",
        cardTitle: "Keep story logic consistent",
        cardText: "Lock characters, locations, scripts, and shots before production.",
        title: "Controlled microdrama workflow",
        body: "Build scenes with continuity checks, locked assets, and clean production prompts.",
    },
    {
        eyebrow: "LOCK",
        metric: "SAFE",
        cardTitle: "Protect every approved detail",
        cardText: "Preserve costumes, faces, props, and locations across every shot.",
        title: "Production rules that stay firm",
        body: "Your bible, manifest, scripts, and anchors work together before render time.",
    },
    {
        eyebrow: "FLOW",
        metric: "FAST",
        cardTitle: "Move from setup to render faster",
        cardText: "Generate references, episode plans, shot manifests, and video prompts in sequence.",
        title: "One workspace for the pipeline",
        body: "Keep creative decisions organized without losing continuity between episodes.",
    },
];

const makeCaptcha = () => String(Math.floor(1000 + Math.random() * 9000));

export default function LoginPage({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [captchaCode, setCaptchaCode] = useState(() => makeCaptcha());
    const [captchaValue, setCaptchaValue] = useState("");
    const [error, setError] = useState("");
    const [activeSlide, setActiveSlide] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setActiveSlide((current) => (current + 1) % LOGIN_SLIDES.length);
        }, 3600);
        return () => window.clearInterval(timer);
    }, []);

    const handleSubmit = (event) => {
        event.preventDefault();
        if (captchaValue.trim() !== captchaCode) {
            setError("CAPTCHA ANGKA SALAH");
            setCaptchaCode(makeCaptcha());
            setCaptchaValue("");
            return;
        }
        const ok = onLogin(username, password);
        if (ok) {
            setPassword("");
            setCaptchaValue("");
            setError("");
            return;
        }
        setError("USERNAME / PASSWORD SALAH");
        setCaptchaCode(makeCaptcha());
        setCaptchaValue("");
    };

    return (
        <main className="login-shell">
          <div className="login-card">
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-brand">COUNTSISTENT (AI) DIRECTOR MICRODRAMA</div>
              <div>
                <div className="login-heading">Sign in</div>
                <div className="login-subtitle">Access your production continuity workspace.</div>
              </div>
              <label className="login-field">
                <span>USERNAME</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus/>
              </label>
              <label className="login-field">
                <span>PASSWORD</span>
                <div className="login-password-wrap">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"/>
                  <button type="button" className="login-password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </label>
              <label className="login-field">
                <span>CAPTCHA ANGKA</span>
                <div className="login-captcha-row">
                  <div className="login-captcha-code">{captchaCode}</div>
                  <button type="button" className="login-captcha-refresh" onClick={() => { setCaptchaCode(makeCaptcha()); setCaptchaValue(""); }} aria-label="Refresh captcha">
                    <RefreshCw size={15}/>
                  </button>
                  <input value={captchaValue} onChange={(event) => setCaptchaValue(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Input angka"/>
                </div>
              </label>
              <button type="submit" className="login-button"><ArrowDownRight size={14}/>Login</button>
              <div className="login-footer">Copyright 2026 - Mora Teknologi Indonesia</div>
            </form>
            <aside className="login-showcase">
              <div className="login-support"><ShieldCheck size={13}/>COUNTSISTENT AI</div>
              <div className="login-slider">
                {LOGIN_SLIDES.map((slide, index) => (
                  <div key={slide.title} className={index === activeSlide ? "login-slide active" : "login-slide"}>
                    <div className="login-feature-card">
                      <div>
                        <strong>{slide.cardTitle}</strong>
                        <span>{slide.cardText}</span>
                      </div>
                      <div className="login-mini-card">
                        <span>{slide.eyebrow}</span>
                        <strong>{slide.metric}</strong>
                      </div>
                    </div>
                    <div className="login-showcase-copy">
                      <h2>{slide.title}</h2>
                      <p>{slide.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="login-dots">
                {LOGIN_SLIDES.map((slide, index) => (
                  <button
                    key={slide.title}
                    type="button"
                    aria-label={`Show login slide ${index + 1}`}
                    className={index === activeSlide ? "active" : ""}
                    onClick={() => setActiveSlide(index)}
                  />
                ))}
              </div>
            </aside>
          </div>
          {error && (
            <div className="login-alert-overlay" role="alertdialog" aria-modal="true" aria-labelledby="login-alert-title">
              <div className="login-alert">
                <div className="login-alert-icon"><AlertTriangle size={30}/></div>
                <div id="login-alert-title" className="login-alert-title">Login gagal</div>
                <div className="login-alert-message">{error}</div>
                <button type="button" className="login-alert-button" onClick={() => setError("")}>
                  OK
                </button>
              </div>
            </div>
          )}
        </main>
    );
}
