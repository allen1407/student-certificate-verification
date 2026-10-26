import React, { useState } from 'react';

export const Card = ({ className = '', children, ...props }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...props}>
    {children}
  </div>
);

export const Label = ({ htmlFor, children, hint }) => (
  <label htmlFor={htmlFor} className="block mb-2">
    <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest">{children}</span>
    {hint && <span className="block text-xs text-slate-400 mt-0.5 normal-case tracking-normal">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-medium text-slate-900 placeholder:text-slate-400 disabled:opacity-60';

export const Button = ({ variant = 'primary', className = '', children, ...props }) => {
  const styles = {
    primary: 'bg-slate-900 hover:bg-black text-white shadow-lg',
    accent: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-md',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md',
    ghost: 'text-slate-600 hover:bg-slate-100',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  };
  return (
    <button
      className={`px-5 py-3 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Alert = ({ tone = 'info', title, children, ...props }) => {
  const tones = {
    info: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border rounded-xl p-4 text-sm ${tones[tone]}`} {...props}>
      {title && <p className="font-bold mb-1">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
};

/** Monospace value with a copy button; wraps long hashes instead of overflowing. */
export const CopyValue = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context); the value is still selectable */
    }
  };
  return (
    <div className="flex items-start gap-2">
      <code className="font-mono text-xs text-slate-700 break-all bg-slate-50 rounded px-2 py-1 flex-1">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label || 'value'}`}
        className="text-xs font-bold text-cyan-700 hover:text-cyan-900 px-2 py-1 shrink-0"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

export const Spinner = () => (
  <span
    aria-hidden="true"
    className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]"
  />
);

export const DetailRow = ({ label, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-4 py-2.5 border-b border-slate-100 last:border-0">
    <dt className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-1">{label}</dt>
    <dd className="text-sm text-slate-800 min-w-0">{children}</dd>
  </div>
);
