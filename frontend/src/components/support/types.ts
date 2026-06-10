// Shared types for the Session Support feature (frontend side).
// Mirrors the backend model in `backend/models/SupportRequest.ts`.

export type SupportIssueType = 'internet' | 'camera' | 'microphone' | 'device' | 'power' | 'other';
export type SupportStatus = 'Pending' | 'In Review' | 'Resolved' | 'Rejected';
export type SupportSenderRole = 'admin' | 'student';

export interface SupportDocument {
  name: string;
  url: string;
  type: string;
}

export interface SupportFollowUp {
  _id: string;
  senderRole: SupportSenderRole;
  senderId: string;
  senderName: string;
  message: string;
  requestProof: boolean;
  documents: SupportDocument[];
  createdAt: string;
}

export interface SupportInternalNote {
  _id: string;
  note: string;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface SupportStatusHistoryEntry {
  _id: string;
  status: SupportStatus;
  note: string;
  updatedBy: string;
  updatedByName: string;
  timestamp: string;
}

export interface SupportRequest {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  issueType: SupportIssueType;
  issueLabel: string;
  title: string;
  details: string;
  attemptedSteps: string[];
  status: SupportStatus;
  adminNote: string;
  /** Only present in admin responses. */
  internalNotes?: SupportInternalNote[];
  resolutionSummary: string;
  sessionAccessUrl: string;
  followUps: SupportFollowUp[];
  statusHistory: SupportStatusHistoryEntry[];
  guidanceShownAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportIssueOption {
  key: SupportIssueType;
  label: string;
  shortLabel: string;
}

export interface SupportSummary {
  total: number;
  unresolvedCount: number;
  byStatus: Record<SupportStatus, number>;
  byIssueType: Record<SupportIssueType, number>;
  recent: Array<{
    _id: string;
    userId: string;
    userName: string;
    issueType: SupportIssueType;
    status: SupportStatus;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SupportListResponse {
  requests: SupportRequest[];
  summary: SupportSummary;
  pagination: { total: number; page: number; limit: number; pages: number };
  issueOptions: SupportIssueOption[];
}

export interface SupportGuidance {
  issueType: SupportIssueType;
  label: string;
  steps: string[];
}

export interface SupportAnalytics {
  totals: {
    total: number;
    resolved: number;
    rejected: number;
    pending: number;
    inReview: number;
    withAttachments: number;
  };
  byStatus: Record<SupportStatus, number>;
  byIssueType: Record<SupportIssueType, number>;
  byDay: Array<{ _id: string; count: number }>;
  recent: Array<{
    _id: string;
    userId: string;
    userName: string;
    issueType: SupportIssueType;
    status: SupportStatus;
    createdAt: string;
  }>;
}
