import { useState, useRef, useEffect, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import UploadPanel from './components/UploadPanel';
import DocumentsList from './components/DocumentsList';
import { api, ChatMessage as Msg, HealthResponse, SessionInfo } from './api';

/* ── Inline SVG icon paths ── */

const ico = {
  menu: 'M4 12h16M4 7h16M4 17h16',
  close: 'M18 6L6 18M6 6l12 12',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71',
  'link-2': 'M14 7a5 5 0 00-7.54.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  check: 'M20 6L9 17l-5-5',
  doc: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  search: 'M11 17.25a6.25 6.25 0 110-12.5 6.25 6.25 0 010 12.5zM16.75 16.75L21 21',
  folderDoc: 'M22 7v13a1 1 0 01-1 1H3a1 1 0 01-1-1V7M22 7H14l-2-2H4a1 1 0 00-1 1H22',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20M12 6v6l4 2',
};

/* ── Main App ── */

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<'upload' | 'docs' | 'status'>('upload');
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [taHeight, setTaHeight] = useState(24);
  const [sessionId, setSessionId] = useState<string>('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load sessions on mount
  useEffect(() => { refreshSessions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSessions = useCallback(async () => {
    try {
      const res = await api.listSessions();
      setSessions(res.sessions);
      // Load the most recent session if one exists
      if (res.sessions.length > 0) {
        const latest = res.sessions[0];
        const hist = await api.getChatHistory(latest.session_id);
        setMessages(hist.messages.map((m) => ({ ...m, sources: [] })));
        setSessionId(latest.session_id);
      } else {
        const newSid = await api.createSession();
        setSessionId(newSid.session_id);
        setMessages([]);
      }
    } catch {
      // If sessions endpoint doesn't exist, just start fresh
      setMessages([]);
    }
  }, []);

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '24px';
    const h = Math.min(el.scrollHeight, 128);
    setTaHeight(h);
  }, [input, isLoading]);

  const flash = (text: string, ok: true | false = true) =>
    setToast({ text, ok });

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Add placeholder
    setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [] }]);

    try {
      let streamedContent = '';
      let sources: Msg['sources'] = [];

      for await (const chunk of api.queryStream(text, sessionId)) {
        if (chunk.type === 'content') {
          streamedContent += chunk.data as string;
          setMessages((prev) => {
            const c = [...prev];
            c[c.length - 1] = { role: 'assistant', content: streamedContent, sources };
            return c;
          });
        } else if (chunk.type === 'sources') {
          sources = (chunk.data as import('./api').SourceDoc[]) ?? [];
          setMessages((prev) => {
            const c = [...prev];
            c[c.length - 1] = { role: 'assistant', content: streamedContent, sources };
            return c;
          });
        }
      }
    } catch {
      setMessages((prev) => {
        const c = [...prev];
        c[c.length - 1] = { role: 'assistant', content: 'Something went wrong — please try again.' };
        return c;
      });
      flash('Query failed', false);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }

    // Refresh session list (but keep current messages with their sources intact)
    api.listSessions().then((res) => setSessions(res.sessions)).catch(() => { });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Start a new chat session
  const newChat = async () => {
    const res = await api.createSession();
    setSessionId(res.session_id);
    setMessages([]);
    setInput('');
    flash('New chat started', true);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-stone-950 relative overflow-hidden font-sans selection:bg-amber-500/20">
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ════════════════════ SIDEBAR ════════════════════ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[22rem] bg-stone-900/90 backdrop-blur-md
          border-r border-stone-800/60 flex flex-col
          transition-transform duration-300 md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 h-[3.25rem] border-b border-stone-800/60">
          {/* ─── Logo mark ─── */}
          <img src="/favicon.svg" alt="logo" className="w-6 h-6 flex-shrink-0" />
          <span className="text-sm font-semibold text-stone-100 tracking-tight">RAG Assistant</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto md:hidden text-stone-500 hover:text-stone-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={ico.close} /></svg>
          </button>
        </div>

        {/* Tab toggles */}
        <div className="flex gap-1 px-3 pt-2.5 flex-shrink-0">
          {([
            ['upload', ico.upload, 'Add'],
            ['docs', ico.folderDoc, 'Docs'],
            ['status', ico.bolt, 'System'],
          ] as const).map(([key, path, label]) => {
            const active = sidebarView === key;
            return (
              <button
                key={key}
                onClick={() => setSidebarView(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[.65rem] font-semibold uppercase tracking-[.08em] py-1.5 rounded-md transition-all
                  ${active
                    ? 'bg-stone-800 text-stone-100 shadow-sm'
                    : 'text-stone-500 hover:text-stone-400'
                  }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {sidebarView === 'upload' ? (
            <UploadPanel
              onUploadComplete={(msg) => flash(msg, true)}
              onError={(err) => flash(err, false)}
            />
          ) : sidebarView === 'docs' ? (
            <DocumentsList
              onDelete={() => flash('Document deleted', true)}
              onRefresh={() => { }}
            />
          ) : (
            <StatusView sessions={sessions} onNewChat={newChat} onClearAll={async () => { await api.clearChatHistory(); setSessions([]); refreshSessions(); flash('All chats cleared'); }} onSessionClick={(sid) => { setSessionId(sid); setMessages([]); api.getChatHistory(sid).then((res) => { setMessages(res.messages.map((m) => ({ ...m, sources: [] }))); }).catch(() => { }); }} onSessionDelete={async (sid) => { await api.deleteSession(sid); refreshSessions(); flash('Session deleted'); }} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800/60 flex-shrink-0">
          <span className="text-[.6rem] text-stone-600 font-mono tracking-wider">v1.0 · RAG Assistant</span>
        </div>
      </aside>

      {/* ════════════════════ MAIN ════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 relative z-0">
        {/* Header bar */}
        <header className="flex items-center gap-3 px-5 h-[3.25rem] border-b border-stone-800/40 flex-shrink-0 bg-stone-950/60 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-stone-400 hover:text-stone-200 p-0.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={ico.menu} /></svg>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-[5px] h-[5px] rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
            <span className="text-[.8rem] font-medium text-stone-200 truncate">Assistant</span>
          </div>
          <button
            onClick={newChat}
            className="flex items-center gap-1.5 text-[.65rem] font-medium text-amber-400/80 hover:text-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/10 transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New Chat
          </button>
        </header>

        {/* ── Content area ── */}
        {isEmpty ? (
          <EmptyView onSelect={(s) => { setInput(s); inputRef.current?.focus(); }} />
        ) : (
          <div className="flex-1 overflow-y-auto scroll-smooth">
            <div className="max-w-[65rem] mx-auto px-6 py-6 space-y-5">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                  isStreaming={msg.role === 'assistant' && i === messages.length - 1 && isLoading}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div
            className={`absolute top-4 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium shadow-xl message-fade-in
              ${toast.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d={toast.ok ? ico.check : ico.close} />
            </svg>
            {toast.text}
          </div>
        )}

        {/* ── Input ── */}
        <div className="border-t border-stone-800/40 p-3 flex-shrink-0 bg-stone-950/60 backdrop-blur">
          <div className="max-w-[65rem] mx-auto">
            <div className="flex items-end gap-2 bg-stone-900/80 border border-stone-800/60 rounded-xl px-3.5 py-2 focus-within:border-amber-500/30 focus-within:ring-1 focus-within:ring-amber-500/10 transition-all group">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your documents…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-stone-100 placeholder-stone-500 resize-none outline-none leading-relaxed"
                style={{ height: taHeight, maxHeight: '8rem' }}
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 p-1.5 rounded-lg text-stone-400
                           hover:bg-amber-500/10 hover:text-amber-400
                           disabled:opacity-20 disabled:cursor-not-allowed
                           transition-all"
                title="Send"
              >
                {isLoading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" fill="currentColor" className="opacity-75" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d={ico.send} />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[.55rem] text-stone-600 text-center mt-1.5 tracking-wide">
              Retrieval-augmented · context-aware responses
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════ EMPTY STATE ═══════════════ */

function EmptyView({ onSelect }: { onSelect: (s: string) => void }) {
  const prompts = [
    { label: 'Summarize my documents', icon: ico.doc },
    { label: 'What topics are covered?', icon: ico.search },
    { label: 'Extract key insights', icon: ico.bolt },
    { label: 'Compare concepts', icon: ico.link },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5">
      {/* Icon mark */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-stone-900/80 border border-stone-800/60 flex items-center justify-center">
          <svg className="w-8 h-8 text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            <circle cx="8" cy="12" r="0.75" fill="currentColor" />
            <circle cx="12" cy="12" r="0.75" fill="currentColor" />
            <circle cx="16" cy="12" r="0.75" fill="currentColor" />
          </svg>
        </div>
      </div>

      <h2 className="text-base font-semibold text-stone-200 mb-1 tracking-tight">RAG Assistant</h2>
      <p className="text-[.8rem] text-stone-500 text-center max-w-xs leading-relaxed mb-8">
        Upload documents or add URLs from the sidebar, then ask questions about their content.
      </p>

      {/* Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {prompts.map((p, i) => (
          <button
            key={p.label}
            onClick={() => onSelect(p.label)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-[.78rem]
                       bg-stone-900/40 border border-stone-800/50 rounded-lg
                       text-stone-400 hover:text-stone-200
                       hover:bg-stone-900/70 hover:border-stone-700/60
                       transition-all group"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <svg
              className="w-3.5 h-3.5 text-stone-600 group-hover:text-amber-400/70 transition-colors flex-shrink-0"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d={p.icon} />
            </svg>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════ STATUS VIEW ═══════════════ */

interface StatusViewProps {
  sessions: SessionInfo[];
  onNewChat: () => void;
  onClearAll: () => void;
  onSessionClick: (sid: string) => void;
  onSessionDelete: (sid: string) => void;
}

function StatusView({ sessions, onNewChat, onClearAll, onSessionClick, onSessionDelete }: StatusViewProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const totalMsg = sessions.reduce((a, s) => a + s.total_messages, 0);

  const fetch = async () => {
    setLoading(true);
    try {
      setHealth(await api.health());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-amber-400/70"><path d={ico.bolt} /></svg>
        <span className="text-[.6rem] font-semibold text-stone-400 uppercase tracking-[.1em]">System</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[48, 56, 64].map((w, i) => (
            <div key={i} className="h-2.5 bg-stone-800/60 rounded-md animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : health ? (
        <>
          {/* Status dot */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="absolute w-4 h-4 rounded-full bg-emerald-400/10 animate-ping" />
            </div>
            <span className="text-xs font-medium text-emerald-400 capitalize">{health.status}</span>
          </div>

          {/* Metrics card */}
          <div className="bg-stone-900/60 rounded-lg border border-stone-800/40 divide-y divide-stone-800/40">
            <Row label="Indexed" value={health.documents.toString()} monospace />
            <Row label="Embedding" value={health.embedding_model} monoSmaller />
            <Row label="LLM" value={health.llm_model} monoSmaller />
            <Row label="Sessions" value={sessions.length > 0 ? `${sessions.length} (${totalMsg} msgs)` : '0'} monoSmaller />
          </div>
        </>
      ) : (
        <div className="bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2.5 text-[.7rem] text-red-400">
          Cannot reach backend — check that the server is running.
        </div>
      )}

      {/* ── Chat History ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-stone-500"><path d={ico.clock} /></svg>
            <span className="text-[.6rem] font-semibold text-stone-400 uppercase tracking-[.1em]">Chat History</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewChat}
              className="text-[.55rem] text-stone-500 hover:text-amber-400 transition-colors flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-stone-800/40"
              title="New chat"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d={ico.plus} /></svg>
              New
            </button>
            {sessions.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-[.55rem] text-stone-600 hover:text-red-400 transition-colors flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-stone-800/40"
                title="Clear all chats"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d={ico.trash} /></svg>
                Clear All
              </button>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-[.6rem] text-stone-600 text-center py-3">No conversations yet</p>
        ) : (
          <div className="space-y-1 max-h-[20rem] overflow-y-auto">
            {sessions.map((sess) => (
              <div
                key={sess.session_id}
                className="group flex items-center gap-2 bg-stone-900/50 border border-stone-800/40 rounded-lg px-2.5 py-2
                           hover:border-stone-700/50 hover:bg-stone-900/70 transition-all cursor-pointer"
              >
                <div
                  className="flex-1 min-w-0 flex items-center gap-2"
                  onClick={() => onSessionClick(sess.session_id)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-stone-600 flex-shrink-0"><path d={ico.clock} /></svg>
                  <span className="text-[.65rem] text-stone-300 truncate">{sess.preview}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onSessionDelete(sess.session_id); }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-stone-600 hover:text-red-400 transition-all"
                  title="Delete conversation"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d={ico.trash} /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, monospace, monoSmaller }: { label: string; value: string; monospace?: boolean; monoSmaller?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[.65rem] text-stone-500">{label}</span>
      <span className={`text-stone-200 tabular-nums ${monospace ? 'font-mono' : ''} ${monoSmaller ? 'text-[.6rem]' : 'text-xs'}`}>
        {value}
      </span>
    </div>
  );
}
