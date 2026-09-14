'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeSnippet {
  language: string;
  label: string;
  code: string;
}

export interface CodeTabsProps {
  snippets: CodeSnippet[];
  className?: string;
}

export function CodeTabs({ snippets, className }: CodeTabsProps) {
  const [activeTab, setActiveTab] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const activeSnippet = snippets[activeTab] || snippets[0];

  const handleCopy = async () => {
    if (!activeSnippet) return;
    try {
      await navigator.clipboard.writeText(activeSnippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failure
    }
  };

  return (
    <div className={cn('rounded-xl border border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-lg', className)}>
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-4 py-2">
        <div className="flex items-center gap-1">
          {snippets.map((s, idx) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                activeTab === idx
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 font-mono text-xs overflow-x-auto leading-relaxed text-slate-300">
        <pre>{activeSnippet?.code}</pre>
      </div>
    </div>
  );
}
