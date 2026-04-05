import { useEffect, useState } from 'react';
import { api, DocEntry } from '../api';

interface Props {
  onDelete: (id: string, filename: string) => void;
  onRefresh: () => void;
}

// File type icon paths
const fileIcons: Record<string, string> = {
  pdf: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M10 13v-3M8 12h4',
  txt: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 12h6M9 16h3',
  md: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M10 13h1M12 12v4M14 13h1',
  url: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 7a5 5 0 00-7.54.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  csv: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
};

function fileExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'txt';
  return filename.slice(dot + 1).toLowerCase();
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function DocumentsList({ onDelete, onRefresh }: Props) {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await api.listDocuments();
      setDocs(r.documents);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleDelete = async (entry: DocEntry) => {
    try {
      await api.deleteDocument(entry.document_id);
      await fetch();
      onDelete(entry.document_id, entry.filename);
    } catch {
      // silently fail — parent will show toast
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-stone-800/60 rounded-lg" style={{ width: `${60 + i * 10}%` }} />
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="text-center py-6">
        <svg className="mx-auto mb-2 text-stone-700" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" />
        </svg>
        <p className="text-[.65rem] text-stone-600">No documents uploaded</p>
        <button
          onClick={onRefresh}
          className="mt-2 text-[.6rem] text-stone-500 hover:text-amber-400 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {docs.map(doc => {
        const ext = fileExt(doc.filename);
        const icon = fileIcons[ext] || fileIcons.txt;

        return (
          <div
            key={doc.document_id}
            className="group flex items-start gap-2.5 bg-stone-900/50 border border-stone-800/40 rounded-lg px-2.5 py-2
                       hover:border-stone-700/60 hover:bg-stone-900/80 transition-all"
          >
            {/* File icon */}
            <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-md bg-amber-500/5 border border-amber-500/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-amber-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d={icon} />
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[.65rem] font-medium text-stone-200 truncate" title={doc.filename}>
                {doc.filename}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[.55rem] text-stone-600 font-mono uppercase px-1 py-px bg-stone-800/60 rounded">
                  {ext}
                </span>
                <span className="text-[.55rem] text-stone-500">{doc.chunks} chunks</span>
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={() => handleDelete(doc)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 text-stone-600 hover:text-red-400 transition-all"
              title="Delete document"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
