/**
 * The one place the browser talks to the server.
 *
 * Centralised so three things are decided once rather than per call site: how
 * an error becomes a value, how the access token is attached, and that no
 * response body is ever interpolated into markup. React escapes what it
 * renders, so the last of those is free — but only while every fetch comes
 * through here and nothing reaches for `dangerouslySetInnerHTML`.
 */

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly details?: unknown;
}

/**
 * A result, not a thrown error.
 *
 * Screens have to render a failure, not crash on one — "the service could not
 * be reached" is a state the interface owes the customer, and an exception is
 * the wrong shape for a state. Throwing also tempts a component into a
 * try/catch per call, which is where a forgotten branch leaves a spinner
 * running forever.
 */
export type ApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiErrorBody };

let accessToken: string | undefined;

export function setAccessToken(token: string | undefined): void {
  accessToken = token;
}

export function getAccessToken(): string | undefined {
  return accessToken;
}

const NETWORK_ERROR: ApiErrorBody = {
  code: 'network_error',
  message: 'The service could not be reached',
};

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (response.status === 204) return { ok: true, data: undefined as T };

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? {} : JSON.parse(text);
    } catch {
      /* A non-JSON body from an API that only speaks JSON means something in
         front of it answered — nginx's own 413 or 502 page, most likely. */
      return { ok: false, error: { code: 'bad_response', message: 'Unexpected response' } };
    }

    if (!response.ok) {
      const error = (parsed as { error?: ApiErrorBody }).error;
      return {
        ok: false,
        error: error ?? { code: `http_${String(response.status)}`, message: 'Request failed' },
      };
    }

    return { ok: true, data: parsed as T };
  } catch (error) {
    /* An aborted request is a navigation, not a failure to show the user. */
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: { code: 'aborted', message: 'Cancelled' } };
    }
    return { ok: false, error: NETWORK_ERROR };
  }
}

/* ── The shapes the screens use ─────────────────────────────────────────── */

export interface TicketSummary {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  inputForm: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedCount: number;
  sla: {
    firstResponseDueAt: string | null;
    resolutionDueAt: string | null;
    firstRespondedAt: string | null;
  };
}

export interface TicketPage {
  tickets: TicketSummary[];
  total: number;
  limit: number;
}

export interface TimelineEntry {
  status: string;
  at: string;
  by: 'customer' | 'staff' | 'system';
  note: string | null;
}

export interface ReopenEligibility {
  ok: boolean;
  reason?: 'disabled' | 'not_closed' | 'window_passed';
  windowDays?: number;
}

export interface ConfirmEligibility {
  ok: boolean;
  reason?: 'not_answered' | 'already_confirmed';
  status?: string;
}

export interface TicketDetail {
  ticket: TicketSummary;
  allowedTransitions: string[];
  timeline: TimelineEntry[];
  reopen: ReopenEligibility;
  /* Absent on the staff view, which has no confirm prompt. */
  confirm?: ConfirmEligibility;
  continues: string | null;
}

export interface Message {
  id: string;
  author: 'customer' | 'assistant' | 'agent' | 'system';
  body: string;
  inputForm: string;
  internal: boolean;
  confidence: number | null;
  createdAt: string;
}

export interface AttachmentSummary {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: string;
  downloadable: boolean;
  createdAt: string;
}

export interface Preferences {
  whatsapp: boolean;
  email: boolean;
  marketingOptOut: boolean;
  preferredLanguage: 'ar' | 'en';
  emailAvailable: boolean;
}

/* ── Calls ──────────────────────────────────────────────────────────────── */

export interface HistoryFilters {
  readonly status?: string;
  readonly search?: string;
  readonly openedAfter?: string;
  readonly openedBefore?: string;
  readonly limit?: number;
}

/**
 * Builds the query string.
 *
 * `URLSearchParams` rather than template interpolation: a search containing
 * `&status=closed` would otherwise become a second parameter, which the
 * server's `strictObject` would reject — confusing, and only confusing
 * because the client built a malformed request.
 */
export function historyQuery(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export const getHistory = (filters: HistoryFilters, signal?: AbortSignal) =>
  api<TicketPage>(`/api/customer/tickets${historyQuery(filters)}`, {
    ...(signal ? { signal } : {}),
  });

export const getTicket = (id: string, signal?: AbortSignal) =>
  api<TicketDetail>(`/api/customer/tickets/${id}`, { ...(signal ? { signal } : {}) });

export const getMessages = (id: string, signal?: AbortSignal) =>
  api<{ messages: Message[] }>(`/api/customer/tickets/${id}/messages`, {
    ...(signal ? { signal } : {}),
  });

export const getAttachments = (id: string, signal?: AbortSignal) =>
  api<{ attachments: AttachmentSummary[] }>(`/api/customer/tickets/${id}/attachments`, {
    ...(signal ? { signal } : {}),
  });

export const getPreferences = (signal?: AbortSignal) =>
  api<{ preferences: Preferences }>('/api/customer/preferences', { ...(signal ? { signal } : {}) });

export const updatePreferences = (body: Partial<Preferences>) =>
  api<{ preferences: Preferences }>('/api/customer/preferences', { method: 'PATCH', body });

export const reopenTicket = (id: string, body: string) =>
  api<{ ticket: TicketSummary }>(`/api/customer/tickets/${id}/reopen`, {
    method: 'POST',
    body: { body },
  });

/**
 * "Did that solve it?"
 *
 * `solved` is sent explicitly rather than inferred from whether a score was
 * given — a four-star rating on an unsolved problem is a real answer, and the
 * server rejects a body without it.
 */
export const confirmResolution = (
  id: string,
  input: { solved: boolean; score?: number; comment?: string },
) =>
  api<{ ticket: TicketSummary; message: Message; escalated: boolean }>(
    `/api/customer/tickets/${id}/confirm`,
    { method: 'POST', body: input },
  );

/** A rating on its own, for a ticket closed days ago. */
export const rateTicket = (id: string, score: number, comment?: string) =>
  api<null>(`/api/customer/tickets/${id}/rating`, {
    method: 'POST',
    body: comment === undefined ? { score } : { score, comment },
  });

/** The transcript is a file, so it is a link rather than a fetch. */
export const transcriptUrl = (id: string, locale: string): string =>
  `/api/customer/tickets/${id}/transcript?locale=${encodeURIComponent(locale)}`;
