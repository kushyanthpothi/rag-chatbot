import { useRef, useState } from 'react';
import { api } from '../api';

interface Props {
  onUploadComplete: (msg: string) => void;
  onError: (err: string) => void;
}

export default function UploadPanel({ onUploadComplete, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');

  const push = async (files: FileList) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const r = await api.uploadFiles(Array.from(files));
      onUploadComplete(r.message);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await api.uploadUrl(url);
      onUploadComplete(r.message);
      setUrl('');
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'URL ingestion failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Title */}
      <span className="text-[.6rem] font-semibold text-stone-400 uppercase tracking-[.1em]">
        Add content
      </span>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); push(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`relative border rounded-lg p-4 text-center cursor-pointer transition-all
          ${drag
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-stone-800/50 hover:border-stone-700/50 hover:bg-stone-800/20'
          }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.rst,.csv"
          className="hidden"
          onChange={(e) => e.target.files && push(e.target.files)}
        />

        {busy ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-3.5 h-3.5 animate-spin border-2 border-amber-400/40 border-t-amber-400 rounded-full" />
            <span className="text-[.7rem] text-amber-400/80 font-medium">Processing…</span>
          </div>
        ) : (
          <div>
            <svg
              className="mx-auto mb-1.5 text-stone-600"
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <p className="text-[.68rem] text-stone-400">
              Drop files or <span className="text-amber-400/80 underline underline-offset-2">browse</span>
            </p>
            <p className="text-[.55rem] text-stone-700 mt-0.5 font-mono tracking-wide">PDF · TXT · MD</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-stone-800/40" />
        <span className="text-[.5rem] text-stone-700 uppercase tracking-wider font-medium">URL</span>
        <div className="flex-1 h-px bg-stone-800/40" />
      </div>

      {/* URL form */}
      <form onSubmit={submitUrl} className="space-y-1.5">
        <div className="flex items-center gap-1.5 bg-stone-900/60 border border-stone-800/40 rounded-lg px-2.5 py-1.5 focus-within:border-stone-700/60 transition-colors">
          <svg className="w-3 h-3 text-stone-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 7a5 5 0 00-7.54.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full bg-transparent text-[.65rem] text-stone-300 placeholder-stone-500 outline-none py-0.5"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="w-full flex items-center justify-center gap-1 text-[.6rem] font-medium py-2
                     bg-amber-400/[.06] text-amber-400/80 border border-amber-400/10 rounded-md
                     hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add URL
        </button>
      </form>
    </div>
  );
}
