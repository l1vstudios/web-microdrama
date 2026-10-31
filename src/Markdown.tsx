import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { TickCircle as Check, Copy } from 'iconsax-reactjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function CopyButton({ text, label = 'Salin', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <button className={`copy-button ${className}`} onClick={async () => {
    try {
      await navigator.clipboard.writeText(text); setCopied(true); setFailed(false);
      clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setFailed(true); }
  }} title={failed ? 'Clipboard tidak tersedia. Pilih teks untuk menyalin.' : label}>
    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Tersalin' : failed ? 'Pilih teks untuk salin' : label}
  </button>;
}
export function Markdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre({ children }) {
      const element = children as ReactElement<{ children?: string; className?: string }>;
      const text = String(element.props.children || '').replace(/\n$/, '');
      return <div className="prompt-block"><div className="prompt-toolbar"><span>{element.props.className?.replace('language-', '').toUpperCase() || 'PROMPT'}</span><CopyButton text={text} label="Salin prompt" /></div><pre>{children}</pre></div>;
    },
    code({ children, className }) {
      return <code className={className}>{children}</code>;
    },
    a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>; },
    table({ children }) { return <div className="table-scroll"><table>{children}</table></div>; },
  }}>{content}</ReactMarkdown>;
}

