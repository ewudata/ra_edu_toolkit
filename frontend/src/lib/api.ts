const BASE_URL = import.meta.env.VITE_BACKEND_URL || '/api';

let _authToken: string | null = null;
let _sessionVersion = 0;
let _aiDisclosure: string | null = null;
let _confirmAiDisclosure: ((privacy: AiPrivacy) => Promise<boolean>) | null = null;
let _onUnauthorized: ((message: string) => void) | null = null;
let _refreshSession: (() => Promise<boolean>) | null = null;

export function setAuthToken(token: string | null, preserveAiDisclosure = false) {
  const keepDisclosure = preserveAiDisclosure && !!_authToken && !!token;
  _authToken = token?.trim() || null;
  _sessionVersion += 1;
  if (!keepDisclosure) _aiDisclosure = null;
}

export function setUnauthorizedHandler(handler: ((message: string) => void) | null) {
  _onUnauthorized = handler;
}

export function setRefreshSessionHandler(handler: (() => Promise<boolean>) | null) {
  _refreshSession = handler;
}

export function getAuthToken() {
  return _authToken;
}

export class ApiError extends Error {
  statusCode: number | null;
  detail: unknown;
  constructor(message: string, statusCode: number | null = null, detail: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

function isAuthFailure(status: number, detail: unknown, message: string): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;

  if (typeof detail === 'object' && detail) {
    const errorCode = 'error_code' in detail ? (detail as Record<string, unknown>).error_code : null;
    const msg = 'msg' in detail ? (detail as Record<string, unknown>).msg : null;
    if (errorCode === 'bad_jwt') return true;
    if (typeof msg === 'string' && msg.toLowerCase().includes('token is expired')) return true;
  }

  return message.toLowerCase().includes('token is expired');
}

async function request<T = unknown>(method: string, endpoint: string, opts?: {
  params?: Record<string, string | number>;
  body?: unknown;
  formData?: FormData;
  retryOnAuthFailure?: boolean;
  aiDisclosure?: string;
}): Promise<T> {
  const requestSession = _sessionVersion;
  let url = `${BASE_URL}${endpoint}`;
  if (opts?.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) qs.set(k, String(v));
    url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
  if (opts?.aiDisclosure) headers['X-AI-Disclosure'] = opts.aiDisclosure;

  let bodyContent: BodyInit | undefined;
  if (opts?.formData) {
    bodyContent = opts.formData;
  } else if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyContent = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body: bodyContent });
  if (requestSession !== _sessionVersion) throw new ApiError("The session changed. Please try again.");
  if (!res.ok) {
    let detail: unknown = null;
    let message = `${res.status} ${res.statusText}`;
    try {
      const payload = await res.json();
      detail = payload.detail ?? payload;
      if (typeof detail === 'string') message = detail;
      else if (typeof detail === 'object' && detail && 'message' in (detail as Record<string, unknown>))
        message = (detail as Record<string, string>).message;
    } catch {
      /* ignore */
    }
    const isAuthError = isAuthFailure(res.status, detail, message);
    if (isAuthError && opts?.retryOnAuthFailure !== false && _refreshSession) {
      const refreshed = await _refreshSession();
      if (refreshed) {
        return request<T>(method, endpoint, { ...opts, retryOnAuthFailure: false });
      }
    }
    if (isAuthError) _onUnauthorized?.(message);
    throw new ApiError(message, res.status, detail);
  }
  if (res.status === 204) return {} as T;
  const text = await res.text();
  if (requestSession !== _sessionVersion) throw new ApiError("The session changed. Please try again.");
  return text ? JSON.parse(text) : ({} as T);
}

export interface AiPrivacy {
  service: string;
  shared_data: string;
  data_policy: string;
  policy_url: string;
  available: boolean;
  version: string;
}

export class AiHelpCancelledError extends Error {
  constructor() {
    super('AI help cancelled.');
  }
}

export function setAiDisclosureHandler(handler: ((privacy: AiPrivacy) => Promise<boolean>) | null) {
  _confirmAiDisclosure = handler;
}

async function aiRequest<T>(endpoint: string, body?: unknown): Promise<T> {
  if (!_authToken) throw new ApiError('Sign in to use AI help.', 401);
  const confirmDisclosure = _confirmAiDisclosure;
  const privacy = await request<AiPrivacy>('GET', '/ai/privacy');
  if (!confirmDisclosure || confirmDisclosure !== _confirmAiDisclosure) throw new AiHelpCancelledError();
  const session = _sessionVersion;
  if (!privacy.available) throw new ApiError('AI help is unavailable until the operator has reviewed its data-sharing policy.', 503);
  if (_aiDisclosure !== privacy.version) {
    const accepted = await confirmDisclosure(privacy);
    if (!accepted) throw new AiHelpCancelledError();
    if (session !== _sessionVersion) throw new ApiError('The session changed. Please try again.');
    _aiDisclosure = privacy.version;
  }
  return request<T>('POST', endpoint, { body, aiDisclosure: privacy.version, retryOnAuthFailure: false });
}

export interface Database {
  name: string;
  table_count: number;
  tables: string[];
  is_default?: boolean;
  has_catalog?: boolean;
}

export interface TableColumn {
  name: string;
  type?: string;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
  sample_rows: Record<string, unknown>[];
  row_count: number | null;
}

export interface SchemaResponse {
  database: string;
  tables: TableInfo[];
}

export interface Query {
  id: string;
  prompt: string;
  difficulty?: string;
  hints?: string[];
  solution?: { relational_algebra?: string; sql?: string };
  expected_schema?: string[];
  expected_rows?: Record<string, unknown>[];
  expected_result?: { schema?: string[] };
}

export interface TraceStep {
  op: string;
  detail?: unknown;
  input_schema?: string[];
  output_schema?: string[];
  rows?: number;
  delta?: Record<string, unknown>;
  preview?: Record<string, unknown>[];
  note?: string;
}

export interface EvaluationResult {
  database: string;
  query_id?: string;
  expression: string;
  is_correct?: boolean | null;
  schema_eval: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  trace: TraceStep[];
  expected_schema?: string[];
  expected_rows?: Record<string, unknown>[];
  solution_relational_algebra?: string;
  solution_sql?: string;
}

export interface TranslationCheckResult {
  database: string;
  query_id: string;
  direction: 'ra-to-sql' | 'sql-to-ra';
  answer: string;
  is_correct: boolean;
  schema_equal: boolean;
  student_schema: string[];
  expected_schema: string[];
  missing_rows: Record<string, unknown>[];
  extra_rows: Record<string, unknown>[];
}

export interface MasteryResponse {
  query_ids: string[];
}

export interface OperatorProgressItem {
  operator: string;
  total: number;
  mastered: number;
  attempted: number;
}

export interface OperatorProgressResponse {
  items: OperatorProgressItem[];
  total_queries: number;
  attempted_queries: number;
  mastered_queries: number;
}

export interface LlmHintResponse {
  hint: string;
  model: string;
}

export interface WalkthroughResponse {
  walkthrough: string;
  model: string;
}

export interface LlmErrorExplanationResponse {
  explanation: string;
  hint: string;
  model: string;
}

export interface RefreshSessionResponse {
  auth_token: string;
  auth_email: string;
  auth_refresh_token: string;
}

export const api = {
  healthCheck: () => request<{ status: string }>('GET', '/health'),

  getDatabases: () => request<Database[]>('GET', '/databases/'),

  getDatabaseSchema: (database: string, sampleRows = 5) =>
    request<SchemaResponse>('GET', `/databases/${database}/schema`, { params: { sample_rows: sampleRows } }),

  importDatabaseFromZip: (name: string, file: File) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('file', file);
    return request<{ name: string }>('POST', '/databases/import/zip', { formData: fd });
  },

  importDatabaseFromSql: (name: string, file: File) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('file', file);
    return request<{ name: string }>('POST', '/databases/import/sql', { formData: fd });
  },

  deleteDatabase: (database: string) =>
    request('DELETE', `/databases/${database}`),

  getQueries: (database: string) =>
    request<Query[]>('GET', `/databases/${database}/queries/`),

  getQueryDetail: (database: string, queryId: string) =>
    request<Query>('GET', `/databases/${database}/queries/${queryId}`),

  getQueryMastery: (database: string) =>
    request<MasteryResponse>('GET', `/databases/${database}/queries/mastery`),

  getOperatorProgress: (database: string) =>
    request<OperatorProgressResponse>('GET', `/databases/${database}/queries/operator-progress`),

  evaluateQuery: (database: string, queryId: string, expression: string) =>
    request<EvaluationResult>('POST', `/databases/${database}/queries/${queryId}/evaluate`, { body: { expression } }),

  checkTranslation: (database: string, queryId: string, direction: 'ra-to-sql' | 'sql-to-ra', answer: string) =>
    request<TranslationCheckResult>('POST', `/databases/${database}/queries/${queryId}/check-translation`, {
      body: { direction, answer },
    }),

  generateHint: (
    database: string,
    queryId: string,
    expression?: string,
    _error?: string,
    direction?: 'ra-to-sql' | 'sql-to-ra',
  ) =>
    aiRequest<LlmHintResponse>(`/databases/${database}/queries/${queryId}/llm/hint`, { expression: expression?.trim() || null, direction: direction ?? null }),

  generateWalkthrough: (database: string, queryId: string) =>
    aiRequest<WalkthroughResponse>(`/databases/${database}/queries/${queryId}/llm/walkthrough`),

  explainRaError: (database: string, expression: string) =>
    aiRequest<LlmErrorExplanationResponse>(`/databases/${database}/llm/explain-error`, { expression }),

  explainSqlError: (database: string, sql: string) =>
    aiRequest<LlmErrorExplanationResponse>(`/databases/${database}/llm/explain-sql-error`, { sql }),

  evaluateCustomQuery: (database: string, expression: string) =>
    request<EvaluationResult>('POST', `/databases/${database}/evaluate`, { body: { expression } }),

  evaluateCustomSqlQuery: (database: string, sql: string) =>
    request<EvaluationResult>('POST', `/databases/${database}/evaluate-sql`, { body: { sql } }),

  getGoogleLoginUrl: async (frontendRedirect: string): Promise<string> => {
    const payload = await request<{ auth_url: string }>('GET', '/auth/google/start', { params: { frontend_redirect: frontendRedirect } });
    if (!payload.auth_url) throw new ApiError('Backend did not return Google OAuth URL.');
    return payload.auth_url;
  },

  refreshSession: (refreshToken: string) =>
    request<RefreshSessionResponse>('POST', '/auth/refresh', {
      body: { refresh_token: refreshToken },
      retryOnAuthFailure: false,
    }),
};
