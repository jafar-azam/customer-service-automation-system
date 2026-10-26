import { api } from './client.js';
import type { Message, TicketSummary, TimelineEntry } from './client.js';

/**
 * What staff can do, as the browser sees it.
 *
 * Every path here is the `audience: 'staff'` mount of a router the customer
 * side also uses, so the shapes are the ones already in `client.ts`. The
 * differences are what the server decides: staff see internal notes and every
 * customer's tickets, and the citation on an assistant answer carries the
 * knowledge entry's id so an agent can open it.
 */

export interface QueueFilters {
  readonly status?: string[];
  readonly assignedToMe?: boolean;
  readonly search?: string;
  readonly limit?: number;
}

function query(filters: QueueFilters): string {
  const parameters = new URLSearchParams();
  for (const status of filters.status ?? []) parameters.append('status', status);
  if (filters.assignedToMe === true) parameters.set('assignedToMe', 'true');
  if (filters.search !== undefined && filters.search !== '') {
    parameters.set('search', filters.search);
  }
  parameters.set('limit', String(filters.limit ?? 25));
  return parameters.toString();
}

export const getQueue = (filters: QueueFilters, signal?: AbortSignal) =>
  api<{ tickets: TicketSummary[]; total: number; limit: number }>(
    `/api/tickets?${query(filters)}`,
    { ...(signal ? { signal } : {}) },
  );

export const getStaffTicket = (id: string, signal?: AbortSignal) =>
  api<{
    ticket: TicketSummary;
    allowedTransitions: string[];
    timeline: TimelineEntry[];
  }>(`/api/tickets/${id}`, { ...(signal ? { signal } : {}) });

export const getStaffMessages = (id: string, signal?: AbortSignal) =>
  api<{ messages: Message[] }>(`/api/tickets/${id}/messages`, { ...(signal ? { signal } : {}) });

/**
 * Replies, or writes a note.
 *
 * `internal` is the whole difference and it is not cosmetic: a note is staff
 * talking to each other, it never reaches the customer, and it deliberately
 * does not move the ticket or stop the response clock (step 11).
 */
export const replyToTicket = (id: string, body: string, internal: boolean) =>
  api<{ message: Message; ticket: TicketSummary }>(`/api/tickets/${id}/messages`, {
    method: 'POST',
    body: { body, internal, inputForm: 'english' },
  });

export const transitionTicket = (id: string, to: string, note?: string) =>
  api<{ ticket: TicketSummary }>(`/api/tickets/${id}/status`, {
    method: 'POST',
    body: note === undefined || note === '' ? { to } : { to, note },
  });

/* ── Knowledge ──────────────────────────────────────────────────────────── */

export interface KbEntry {
  id: string;
  title: string;
  body: string;
  question: string | null;
  language: 'ar' | 'en';
  category: string | null;
  tags: string[];
  status: string;
  version: number;
  reviewNote: string | null;
  source: string;
  publishable: boolean;
  usageCount: number;
  unhelpfulCount: number;
  updatedAt: string;
}

export interface KbVersion {
  version: number;
  title: string;
  body: string;
  status: string;
  editedAt: string;
  changeNote: string | null;
}

export const getApprovalQueue = (signal?: AbortSignal) =>
  api<{ entries: KbEntry[]; total: number }>('/api/knowledge/queue', {
    ...(signal ? { signal } : {}),
  });

export const getKbEntry = (id: string, signal?: AbortSignal) =>
  api<{ entry: KbEntry; versions: KbVersion[] }>(`/api/knowledge/${id}`, {
    ...(signal ? { signal } : {}),
  });

export const updateKbEntry = (
  id: string,
  body: {
    title: string;
    body: string;
    language: 'ar' | 'en';
    question?: string;
    changeNote?: string;
  },
) => api<{ entry: KbEntry }>(`/api/knowledge/${id}`, { method: 'PUT', body });

export const approveKbEntry = (id: string) =>
  api<{ entry: KbEntry }>(`/api/knowledge/${id}/approve`, { method: 'POST', body: {} });

/** The note is required by the server: a rejection with no reason gives the
    person who wrote the entry nothing to act on. */
export const rejectKbEntry = (id: string, note: string) =>
  api<{ entry: KbEntry }>(`/api/knowledge/${id}/reject`, { method: 'POST', body: { note } });

/** A link rather than a fetch: the export is a file the reviewer keeps. */
export const knowledgeExportUrl = (status: string, language?: string): string => {
  const parameters = new URLSearchParams({ status, limit: '1000' });
  if (language !== undefined) parameters.set('language', language);
  return `/api/knowledge/export.csv?${parameters.toString()}`;
};
