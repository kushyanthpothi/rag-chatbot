import { useState } from 'react';
import { SourceDoc } from '../api';
import Markdown from './Markdown';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceDoc[];
  isStreaming?: boolean;
}

export default function ChatMessage({ role, content, sources = [], isStreaming }: Props) {
  // ── User message (raw text, no markdown)
  if (role === 'user') {
    return (
      <div className="flex justify-end message-fade-in" style={{ animationFillMode: 'both' }}>
        <div className="max-w-[90%] bg-amber-500/[.08] border border-amber-500/10 rounded-2xl rounded-br-sm px-4 py-2.5">
          <p className="text-[.82rem] leading-relaxed whitespace-pre-wrap text-stone-100">
            {content}
          </p>
        </div>
      </div>
    );
  }

  // ── Assistant message (rendered as markdown)
  const hasSources = sources.length > 0;

  return (
    <div className="message-fade-in" style={{ animationFillMode: 'both' }}>
      <div className="max-w-[92%]">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 relative w-7 h-7 flex items-center justify-center">
            {isStreaming && (
              <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
            )}
            <img src="/favicon.svg" alt="" className="w-[17px] h-[17px]" />
          </div>

          {/* Content body */}
          <div className="flex-1 min-w-0">
            {content ? (
              <Markdown text={content} />
            ) : isStreaming ? (
              <p className="text-stone-600 text-[.7rem] italic">Thinking…</p>
            ) : (
              <p className="text-stone-600 text-[.7rem] italic">Empty response</p>
            )}

            {/* Source attribution */}
            {hasSources && <SourceAccordion sources={sources} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Source accordion
function SourceAccordion({ sources }: { sources: SourceDoc[] }) {
  const [open, setOpen] = useState(false);
  const pct = (s: SourceDoc) => Math.round(s.score * 100);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[.65rem] text-stone-500 hover:text-stone-300 transition-colors group"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-medium">{sources.length} source{sources.length > 1 ? 's' : ''}</span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5 ml-5">
          {sources.map((src, i) => (
            <div
              key={i}
              className="bg-stone-900/60 border border-stone-800/40 rounded-lg px-3 py-2 hover:border-stone-700/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 rounded-sm bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  </svg>
                </div>
                <span className="text-[.6rem] text-stone-400 truncate font-medium max-w-[10rem]" title={src.source}>
                  {src.source}
                </span>
                <span className="ml-auto text-[.55rem] px-1.5 py-0.5 bg-stone-800/70 text-stone-500 rounded font-mono flex-shrink-0 tabular-nums">
                  {pct(src)}%
                </span>
              </div>
              <p className="text-[.65rem] text-stone-500 line-clamp-2 ml-6 leading-relaxed">
                {src.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
