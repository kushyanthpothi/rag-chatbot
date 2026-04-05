/* ─── API client for the RAG chatbot backend ─── */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface SourceDoc {
  content: string;
  source: string;
  score: number;
  page_number: number | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceDoc[];
}

export interface SessionInfo {
  session_id: string;
  preview: string;
  total_messages: number;
}

export interface QueryResponse {
  answer: string;
  sources: SourceDoc[];
  latency_ms: number;
  tenant_id: string;
  session_id?: string;
}

export interface UploadResponse {
  document_ids: string[];
  message: string;
  total_chunks: number;
}

export interface HealthResponse {
  status: string;
  documents: number;
  embedding_model: string;
  llm_model: string;
}

export interface DocEntry {
  document_id: string;
  filename: string;
  chunks: number;
  source: string;
}

class APIClient {
  async health(): Promise<HealthResponse> {
    return this.get(`${BASE}/health`);
  }

  async listDocuments(): Promise<{ documents: DocEntry[] }> {
    return this.get(`${BASE}/documents/list`);
  }

  async query(question: string, sessionId: string, tenantId = 'default', topK?: number): Promise<QueryResponse> {
    return this.post(`${BASE}/query`, { question, session_id: sessionId, tenant_id: tenantId, top_k: topK });
  }

  async *queryStream(question: string, sessionId: string, tenantId = 'default', topK?: number)
    : AsyncGenerator<{ type: string; data: string | SourceDoc[] }> {
    const resp = await fetch(`${BASE}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, session_id: sessionId, tenant_id: tenantId, top_k: topK, use_stream: true }),
    });
    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6));
          } catch {
            // skip malformed
          }
        }
      }
    }
  }

  async uploadFiles(files: File[], tenantId = 'default'): Promise<UploadResponse> {
    const form = new FormData();
    form.append('tenant_id', tenantId);
    for (const file of files) {
      form.append('files', file);
    }
    return this.post(`${BASE}/documents/upload`, form, false);
  }

  async uploadUrl(url: string, tenantId = 'default'): Promise<{ document_id: string; chunks: number; message: string }> {
    const form = new FormData();
    form.append('url', url);
    form.append('tenant_id', tenantId);
    return this.post(`${BASE}/documents/upload/url`, form, false);
  }

  async deleteDocument(id: string): Promise<{ deleted: number }> {
    return this.del(`${BASE}/documents/delete/${id}`);
  }

  // -- Session management --

  async listSessions(tenantId = 'default'): Promise<{ sessions: SessionInfo[] }> {
    return this.get(`${BASE}/chat/sessions?tenant_id=${encodeURIComponent(tenantId)}`);
  }

  async createSession(tenantId = 'default'): Promise<{ session_id: string }> {
    return this.post(`${BASE}/chat/sessions?tenant_id=${encodeURIComponent(tenantId)}`, {});
  }

  async deleteSession(sessionId: string, tenantId = 'default'): Promise<{ deleted: boolean }> {
    return this.del(`${BASE}/chat/sessions/${sessionId}?tenant_id=${encodeURIComponent(tenantId)}`);
  }

  async getChatHistory(sessionId: string, tenantId = 'default'): Promise<{ messages: ChatMessage[]; session_id: string }> {
    return this.get(`${BASE}/chat/history?tenant_id=${encodeURIComponent(tenantId)}&session_id=${encodeURIComponent(sessionId)}`);
  }

  async clearChatHistory(tenantId = 'default'): Promise<{ message: string }> {
    return this.del(`${BASE}/chat/clear?tenant_id=${encodeURIComponent(tenantId)}`);
  }

  private async post<T>(url: string, body: Record<string, unknown> | FormData, json = true): Promise<T> {
    const headers = json ? { 'Content-Type': 'application/json' } : undefined;
    const resp = await fetch(url, { method: 'POST', headers, body: jsonBody(body) as BodyInit });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`API error: ${resp.statusText} — ${body}`);
    }
    return resp.json();
  }

  private async get<T>(url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API error: ${resp.statusText}`);
    return resp.json();
  }

  private async del<T>(url: string): Promise<T> {
    const resp = await fetch(url, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`API error: ${resp.statusText}`);
    return resp.json();
  }
}

function jsonBody(body: Record<string, unknown> | FormData): BodyInit | undefined {
  return body instanceof FormData ? body : JSON.stringify(body);
}

export const api = new APIClient();
