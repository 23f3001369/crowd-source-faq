// API client for the Session Support feature. Reuses the existing
// `api` axios instance (so JWT auth, error toasts, file uploads all
// work consistently).

import api from '../../utils/api';
import type {
  SupportGuidance,
  SupportListResponse,
  SupportAnalytics,
  SupportRequest,
  SupportIssueType,
  SupportStatus,
} from './types';

export const SUPPORT_ISSUE_OPTIONS: { key: SupportIssueType; label: string; shortLabel: string; icon: 'wifi' | 'camera' | 'mic' | 'device' | 'power' | 'other' }[] = [
  { key: 'internet',   label: 'Internet Problem', shortLabel: 'Internet', icon: 'wifi' },
  { key: 'camera',     label: 'Camera Issue',     shortLabel: 'Camera',   icon: 'camera' },
  { key: 'microphone', label: 'Microphone Issue', shortLabel: 'Mic',      icon: 'mic' },
  { key: 'device',     label: 'Device Failure',   shortLabel: 'Device',   icon: 'device' },
  { key: 'power',      label: 'Power Outage',     shortLabel: 'Power',    icon: 'power' },
  { key: 'other',      label: 'Other Reason',     shortLabel: 'Other',    icon: 'other' },
];

export async function fetchTroubleshoot(issueType: string): Promise<SupportGuidance> {
  const res = await api.get<SupportGuidance>(`/support/troubleshoot/${issueType}`);
  return res.data;
}

export interface ListFilters {
  status?: SupportStatus;
  issueType?: SupportIssueType;
  q?: string;
  userName?: string;
  email?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listSupportRequests(filters: ListFilters = {}): Promise<SupportListResponse> {
  const res = await api.get<SupportListResponse>('/support/requests', { params: filters });
  return res.data;
}

export async function getSupportRequest(id: string): Promise<SupportRequest> {
  const res = await api.get<{ request: SupportRequest }>(`/support/requests/${id}`);
  return res.data.request;
}

export interface SubmitPayload {
  issueType: SupportIssueType;
  title?: string;
  details: string;
  attemptedSteps: string[];
  documents?: { name: string; url: string; type: string }[];
  guidanceShownAt?: string;
}

export async function submitSupportRequest(payload: SubmitPayload): Promise<SupportRequest> {
  const res = await api.post<{ request: SupportRequest }>('/support/requests', payload);
  return res.data.request;
}

export async function replyToSupportRequest(
  id: string,
  message: string,
  documents: { name: string; url: string; type: string }[] = [],
  requestProof = false,
): Promise<SupportRequest> {
  const res = await api.post<{ request: SupportRequest }>(`/support/requests/${id}/follow-ups`, {
    message,
    documents,
    requestProof,
  });
  return res.data.request;
}

export interface StatusUpdatePayload {
  status: SupportStatus;
  adminNote?: string;
  internalNote?: string;
  resolutionSummary?: string;
  sessionAccessUrl?: string;
  followUpMessage?: string;
  requestProof?: boolean;
}

export async function updateSupportStatus(
  id: string,
  payload: StatusUpdatePayload,
): Promise<SupportRequest> {
  const res = await api.patch<{ request: SupportRequest }>(`/support/requests/${id}/status`, payload);
  return res.data.request;
}

export async function listGuidance(): Promise<SupportGuidance[]> {
  const res = await api.get<SupportGuidance[]>('/support/guidance');
  return res.data;
}

export async function updateGuidance(issueType: SupportIssueType, steps: string[]): Promise<SupportGuidance> {
  const res = await api.put<{ guidance: SupportGuidance }>(`/support/guidance/${issueType}`, { steps });
  return res.data.guidance;
}

export async function fetchSupportAnalytics(): Promise<SupportAnalytics> {
  const res = await api.get<SupportAnalytics>('/support/analytics');
  return res.data;
}
