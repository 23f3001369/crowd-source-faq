/**
 * supportController.ts — Session Support Ticket feature.
 *
 * All routes in this controller are gated by the Session Support
 * feature flag. When the flag is OFF, the controller returns 404
 * for every public-facing route (looks like the feature doesn't
 * exist). Admin routes for managing checklists and analytics
 * are NOT gated — admins should be able to inspect the feature
 * state even when it's disabled.
 *
 * The existing middleware (`protect`, `authorize`) is reused for
 * auth. The new `isFeatureEnabled('sessionSupport')` check is
 * additive — it only affects this router.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest, {
  ISSUE_CONFIGS,
  getIssueConfig,
  type SupportIssueType,
  type SupportStatus,
  type ISupportFollowUp,
} from '../models/SupportRequest.js';
import AttendanceGuidance from '../models/AttendanceGuidance.js';
import Notification from '../models/Notification.js';
import AdminLog from '../models/AdminLog.js';
import { logger } from '../utils/logger.js';
import { invalidateFeatureFlagCache, isFeatureEnabled } from './featureFlagController.js';
import { invalidatePublicCaches } from './publicFaqController.js';

// ─── Valid statuses (mirrors the model enum) ───────────────────────────────

const VALID_STATUSES: SupportStatus[] = ['Pending', 'In Review', 'Resolved', 'Rejected'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAuthedUserId(req: Request): Types.ObjectId | null {
  const id = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;
  if (!id) return null;
  return typeof id === 'string' ? new Types.ObjectId(id) : (id as Types.ObjectId);
}

function getAuthedUserRole(req: Request): 'user' | 'moderator' | 'admin' | 'expert' | 'ai_moderator' | undefined {
  return (req as Request & { user?: { role?: 'user' | 'moderator' | 'admin' | 'expert' | 'ai_moderator' } }).user?.role;
}

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip admin-only fields when sending a ticket to a non-admin. */
function stripAdminOnlyFields<T extends object>(ticket: T, isAdmin: boolean): T {
  if (isAdmin) return ticket;
  const copy = { ...ticket } as T & Record<string, unknown>;
  delete (copy as Record<string, unknown>).internalNotes;
  return copy as T;
}

async function fanOutToAdmins(
  payload: { title: string; message: string; link: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    // We don't import the User model here directly to avoid a circular
    // dependency in test setups; the AdminLog import already pulls it
    // transitively. Look up admin user ids inline.
    const { default: User } = await import('../models/User.js');
    const admins = await User.find({ role: { $in: ['admin', 'moderator'] } }).select('_id').lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map((a) => ({
        recipient: a._id,
        type: 'support' as const,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        metadata: payload.metadata,
      })),
    );
  } catch (err) {
    logger.warn(`[support] fanOutToAdmins failed: ${(err as Error).message}`);
  }
}

async function notifyUser(
  userId: Types.ObjectId,
  payload: { title: string; message: string; link: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await Notification.create({
      recipient: userId,
      type: 'support',
      title: payload.title,
      message: payload.message,
      link: payload.link,
      metadata: payload.metadata,
    });
  } catch (err) {
    logger.warn(`[support] notifyUser failed: ${(err as Error).message}`);
  }
}

async function logAdminAction(
  adminId: Types.ObjectId,
  adminName: string,
  action: string,
  requestId: Types.ObjectId,
  details: string,
): Promise<void> {
  try {
    await AdminLog.create({
      adminId,
      action,
      targetId: requestId,
      targetType: 'support_request',
      details,
    });
  } catch (err) {
    logger.warn(`[support] logAdminAction failed: ${(err as Error).message}`);
  }
}

// ─── Guards ──────────────────────────────────────────────────────────────────

/** For user-facing routes — return 404 when feature is off. */
async function requireFeatureOn(_req: Request, res: Response): Promise<boolean> {
  if (!(await isFeatureEnabled('sessionSupport'))) {
    res.status(404).json({ message: 'This feature is not available.' });
    return false;
  }
  return true;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/support/troubleshoot/:issueType
 * Returns the checklist for an issue type. Auto-creates from in-code
 * defaults if no row exists in AttendanceGuidance. Gated by flag.
 */
export async function getTroubleshootSteps(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  try {
    const issueType = String(req.params.issueType || '').trim() as SupportIssueType;
    const config = getIssueConfig(issueType);
    let guidance = await AttendanceGuidance.findOne({ issueType });
    if (!guidance) {
      guidance = await AttendanceGuidance.create({
        issueType,
        steps: config.steps,
        updatedBy: null,
      });
    }
    res.json({
      issueType,
      label: config.label,
      steps: guidance.steps,
    });
  } catch (err) {
    logger.error(`[support] getTroubleshootSteps failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load troubleshooting steps.' });
  }
}

/**
 * POST /api/support/requests
 * Submit a new request. Gated by flag.
 */
export async function createSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const body = (req.body ?? {}) as {
    issueType?: string;
    title?: string;
    details?: string;
    attemptedSteps?: string[];
    documents?: { name?: string; url?: string; type?: string }[];
    guidanceShownAt?: string;
  };

  const rawIssueType = String(body.issueType || '').trim();
  if (!(rawIssueType in ISSUE_CONFIGS)) {
    res.status(400).json({ message: 'Please choose a valid issue type.' });
    return;
  }
  const issueType = rawIssueType as SupportIssueType;
  const config = ISSUE_CONFIGS[issueType];

  const details = String(body.details || '').trim();
  if (!details) {
    res.status(400).json({ message: 'Please describe the issue before submitting.' });
    return;
  }

  const title = String(body.title || '').trim().slice(0, 180)
    || `${config.label} — Unable to attend session`;

  const attemptedSteps = Array.isArray(body.attemptedSteps)
    ? body.attemptedSteps.map((s) => String(s).trim()).filter(Boolean).slice(0, 10)
    : [];

  const documents = Array.isArray(body.documents)
    ? body.documents
        .filter((d) => d && typeof d.url === 'string' && d.url)
        .map((d) => ({
          name: String(d.name || '').slice(0, 200),
          url:  String(d.url || '').slice(0, 1000),
          type: String(d.type || '').slice(0, 60),
        }))
        .slice(0, 4)
    : [];

  const guidanceShownAt = body.guidanceShownAt
    ? new Date(body.guidanceShownAt)
    : null;
  if (guidanceShownAt && isNaN(guidanceShownAt.getTime())) {
    res.status(400).json({ message: 'Invalid guidanceShownAt.' });
    return;
  }

  try {
    // Fetch the requester's user record for denormalised name/email
    const { default: User } = await import('../models/User.js');
    const requester = await User.findById(userId).select('name email').lean();
    if (!requester) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const request = await SupportRequest.create({
      userId,
      userName: requester.name,
      userEmail: requester.email,
      issueType,
      issueLabel: config.label,
      title,
      details,
      attemptedSteps,
      status: 'Pending',
      statusHistory: [{
        status: 'Pending',
        note: 'Request submitted.',
        updatedBy: userId,
        updatedByName: requester.name,
        timestamp: new Date(),
      }],
      guidanceShownAt,
    });

    // Attach the documents (if any) as the first follow-up, so the
    // student can attach proof at submit time without the admin
    // having to request it.
    if (documents.length > 0) {
      const initialFollowUp: Partial<ISupportFollowUp> = {
        senderRole: 'student',
        senderId: userId,
        senderName: requester.name,
        message: documents.length === 1 ? 'Attached proof:' : 'Attached proofs:',
        requestProof: false,
        documents: documents as ISupportFollowUp['documents'],
      };
      request.followUps.push(initialFollowUp as ISupportFollowUp);
      await request.save();
    }

    // Notify all admins
    await fanOutToAdmins({
      title: 'New session support request',
      message: `${requester.name} reported ${config.label.toLowerCase()} and needs help attending a session.`,
      link: '/admin/support',
      metadata: {
        supportRequestId: request._id.toString(),
        issueType,
        status: 'Pending',
      },
    });

    res.status(201).json({ request: stripAdminOnlyFields(request.toObject(), false) });
  } catch (err) {
    logger.error(`[support] createSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to submit support request.' });
  }
}

/**
 * GET /api/support/requests
 * List own requests; admin/moderator sees all with filters.
 * Gated by flag.
 */
export async function listSupportRequests(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const isAdmin = getAuthedUserRole(req) === 'admin' || getAuthedUserRole(req) === 'moderator';

  try {
    const { status, issueType, q, userName, email, from, to } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = isAdmin ? {} : { userId };
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? (isAdmin ? '25' : '20'))) || (isAdmin ? 25 : 20)));
    const skip = (page - 1) * limit;

    if (status && VALID_STATUSES.includes(status as SupportStatus)) {
      filter.status = status;
    }
    if (issueType && issueType in ISSUE_CONFIGS) {
      filter.issueType = issueType;
    }
    if (isAdmin && q) {
      const regex = new RegExp(escapeRegex(q).slice(0, 120), 'i');
      filter.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { details: regex },
        { adminNote: regex },
        { resolutionSummary: regex },
      ];
    }
    if (isAdmin && userName) {
      filter.userName = new RegExp(escapeRegex(userName).slice(0, 80), 'i');
    }
    if (isAdmin && email) {
      filter.userEmail = new RegExp(escapeRegex(email).slice(0, 120), 'i');
    }
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (fromDate && !isNaN(fromDate.getTime())) createdAt.$gte = fromDate;
      if (toDate && !isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        createdAt.$lte = toDate;
      }
      if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    }

    const [total, requests, statusRows, issueRows, recentRows] = await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
      ]),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(5)
        .select('userId userName issueType status createdAt updatedAt')
        .lean(),
    ]);

    const statusCounts = statusRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const issueTypeCounts = issueRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});

    const byStatus = VALID_STATUSES.reduce<Record<string, number>>((acc, s) => {
      acc[s] = statusCounts[s] ?? 0;
      return acc;
    }, {});
    const byIssueType = Object.keys(ISSUE_CONFIGS).reduce<Record<string, number>>((acc, k) => {
      acc[k] = issueTypeCounts[k] ?? 0;
      return acc;
    }, {});

    const unresolved = (byStatus['Pending'] ?? 0) + (byStatus['In Review'] ?? 0) + (byStatus['Rejected'] ?? 0);

    res.json({
      requests: requests.map((r) => stripAdminOnlyFields(r, isAdmin)),
      summary: {
        total,
        unresolvedCount: unresolved,
        byStatus,
        byIssueType,
        recent: recentRows,
      },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      issueOptions: Object.entries(ISSUE_CONFIGS).map(([key, value]) => ({
        key,
        label: value.label,
        shortLabel: value.shortLabel,
      })),
    });
  } catch (err) {
    logger.error(`[support] listSupportRequests failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support requests.' });
  }
}

/**
 * GET /api/support/requests/:id
 * Get one. Students see only their own. Admin sees any.
 * Gated by flag.
 */
export async function getSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  try {
    const request = await SupportRequest.findById(id).lean();
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      // Don't leak existence — return 404, not 403
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    res.json({ request: stripAdminOnlyFields(request, isAdmin) });
  } catch (err) {
    logger.error(`[support] getSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support request.' });
  }
}

/**
 * POST /api/support/requests/:id/follow-ups
 * Add a follow-up message. Students can reply on their own tickets;
 * admins can reply on any.
 * Gated by flag.
 */
export async function addSupportFollowUp(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as {
    message?: string;
    documents?: { name?: string; url?: string; type?: string }[];
    requestProof?: boolean;
  };
  const message = String(body.message || '').trim();
  if (!message) {
    res.status(400).json({ message: 'Follow-up message cannot be empty.' });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ message: 'Follow-up message is too long.' });
    return;
  }

  const documents = Array.isArray(body.documents)
    ? body.documents
        .filter((d) => d && typeof d.url === 'string' && d.url)
        .map((d) => ({
          name: String(d.name || '').slice(0, 200),
          url:  String(d.url || '').slice(0, 1000),
          type: String(d.type || '').slice(0, 60),
        }))
        .slice(0, 4)
    : [];

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }

    const { default: User } = await import('../models/User.js');
    const sender = await User.findById(userId).select('name').lean();
    if (!sender) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const senderRole = isAdmin ? 'admin' : 'student';
    const requestProof = isAdmin && Boolean(body.requestProof);

    request.followUps.push({
      senderRole,
      senderId: userId,
      senderName: sender.name,
      message,
      requestProof,
      documents: documents as ISupportFollowUp['documents'],
      createdAt: new Date(),
    });
    await request.save();

    // Notify the *other* side
    if (isAdmin) {
      await notifyUser(request.userId, {
        title: 'New reply on your support request',
        message: message.slice(0, 200),
        link: '/support/' + request._id.toString(),
        metadata: {
          supportRequestId: request._id.toString(),
          issueType: request.issueType,
          status: request.status,
          requestProof,
        },
      });
      await logAdminAction(userId, sender.name, 'support_follow_up', request._id, message.slice(0, 200));
    } else {
      await fanOutToAdmins({
        title: 'Student reply on support request',
        message: message.slice(0, 200),
        link: '/admin/support/' + request._id.toString(),
        metadata: {
          supportRequestId: request._id.toString(),
          issueType: request.issueType,
          status: request.status,
        },
      });
    }

    res.json({ request: stripAdminOnlyFields(request.toObject(), isAdmin) });
  } catch (err) {
    logger.error(`[support] addSupportFollowUp failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to add follow-up.' });
  }
}

/**
 * PATCH /api/support/requests/:id/status
 * Admin-only. Change status, add notes, attach session access URL.
 * Gated by flag.
 */
export async function updateSupportStatus(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as {
    status?: string;
    adminNote?: string;
    internalNote?: string;
    resolutionSummary?: string;
    sessionAccessUrl?: string;
    followUpMessage?: string;
    requestProof?: boolean;
  };
  const nextStatus = String(body.status || '').trim() as SupportStatus;
  if (!VALID_STATUSES.includes(nextStatus)) {
    res.status(400).json({ message: 'Invalid status value.' });
    return;
  }

  if (nextStatus === 'Rejected' && !String(body.adminNote || '').trim()) {
    res.status(400).json({ message: 'An admin note is required when rejecting a request.' });
    return;
  }

  const adminNote = String(body.adminNote || '').trim().slice(0, 2000);
  const internalNote = String(body.internalNote || '').trim().slice(0, 2000);
  const resolutionSummary = String(body.resolutionSummary || '').trim().slice(0, 2000);
  const sessionAccessUrl = String(body.sessionAccessUrl || '').trim().slice(0, 500);
  const followUpMessage = String(body.followUpMessage || '').trim().slice(0, 2000);
  const requestProof = Boolean(body.requestProof);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (request.status === nextStatus) {
      res.status(409).json({ message: `Request is already in status '${nextStatus}'.` });
      return;
    }

    const { default: User } = await import('../models/User.js');
    const admin = await User.findById(userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    request.status = nextStatus;
    request.adminNote = adminNote || request.adminNote;
    if (internalNote) {
      request.internalNotes.push({
        note: internalNote,
        addedBy: userId,
        addedByName: admin.name,
        createdAt: new Date(),
      });
    }
    if (resolutionSummary) request.resolutionSummary = resolutionSummary;
    if (sessionAccessUrl) request.sessionAccessUrl = sessionAccessUrl;
    if (followUpMessage) {
      request.followUps.push({
        senderRole: 'admin',
        senderId: userId,
        senderName: admin.name,
        message: followUpMessage,
        requestProof,
        documents: [],
        createdAt: new Date(),
      });
    }
    request.statusHistory.push({
      status: nextStatus,
      note: adminNote || resolutionSummary || `Status changed to ${nextStatus}.`,
      updatedBy: userId,
      updatedByName: admin.name,
      timestamp: new Date(),
    });
    request.updatedAt = new Date();
    await request.save();

    // Notify the student
    const titleByStatus: Record<SupportStatus, string> = {
      'Pending':   'Your support request was reopened',
      'In Review': 'Your support request is under review',
      'Resolved':  'Your support request was resolved',
      'Rejected':  'Your support request was rejected',
    };
    const baseMsg = nextStatus === 'Resolved' && request.sessionAccessUrl
      ? 'Your request was approved and the recorded session is available now.'
      : nextStatus === 'Resolved'
      ? 'Your request was approved. The recorded session link will appear once shared by the admin team.'
      : nextStatus === 'Rejected'
      ? 'Your request was reviewed and marked rejected. Please check the admin note for details.'
      : 'Your request is being reviewed by the support team.';
    await notifyUser(request.userId, {
      title: titleByStatus[nextStatus],
      message: baseMsg,
      link: '/support/' + request._id.toString(),
      metadata: {
        supportRequestId: request._id.toString(),
        issueType: request.issueType,
        status: nextStatus,
        sessionAccessUrl: request.sessionAccessUrl || '',
      },
    });
    await logAdminAction(
      userId,
      admin.name,
      'support_status_change',
      request._id,
      `Status: ${nextStatus}${adminNote ? ` | Note: ${adminNote.slice(0, 100)}` : ''}`,
    );
    if (sessionAccessUrl) {
      await logAdminAction(
        userId,
        admin.name,
        'recorded_session_attached',
        request._id,
        `Recorded session URL attached on ${nextStatus}`,
      );
    }

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    logger.error(`[support] updateSupportStatus failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update support request.' });
  }
}

// ─── Admin-only routes (not gated by feature flag) ─────────────────────────

/** GET /api/support/guidance — list all 6 checklists. */
export async function listGuidance(_req: Request, res: Response): Promise<void> {
  try {
    const results: Array<{ issueType: string; label: string; steps: string[] }> = [];
    for (const [key, cfg] of Object.entries(ISSUE_CONFIGS)) {
      let row = await AttendanceGuidance.findOne({ issueType: key });
      if (!row) {
        row = await AttendanceGuidance.create({ issueType: key, steps: cfg.steps });
      }
      results.push({ issueType: key, label: cfg.label, steps: row.steps });
    }
    res.json(results);
  } catch (err) {
    logger.error(`[support] listGuidance failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load guidance.' });
  }
}

/** PUT /api/support/guidance/:issueType — replace checklist. */
export async function updateGuidance(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const rawKey = req.params.issueType;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !(key in ISSUE_CONFIGS)) {
    res.status(404).json({ message: 'Unknown issue type.' });
    return;
  }

  const body = (req.body ?? {}) as { steps?: unknown };
  if (!Array.isArray(body.steps)) {
    res.status(400).json({ message: 'Steps must be an array of strings.' });
    return;
  }
  const cleaned = body.steps
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 20);

  try {
    let row = await AttendanceGuidance.findOne({ issueType: key });
    if (!row) {
      row = new AttendanceGuidance({ issueType: key, steps: cleaned, updatedBy: userId });
    } else {
      row.steps = cleaned;
      row.updatedBy = userId;
    }
    await row.save();
    res.json({ message: 'Guidance steps updated.', guidance: { issueType: key, label: ISSUE_CONFIGS[key as SupportIssueType].label, steps: cleaned } });
  } catch (err) {
    logger.error(`[support] updateGuidance failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update guidance.' });
  }
}

/** GET /api/support/analytics — admin summary. */
export async function getSupportAnalytics(_req: Request, res: Response): Promise<void> {
  try {
    const [byStatusRows, byIssueTypeRows, byDayRows, recent, totals] = await Promise.all([
      SupportRequest.aggregate<{ _id: SupportStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate<{ _id: SupportIssueType; count: number }>([
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate<{ _id: string; count: number }>([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
      SupportRequest.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('userId userName issueType status createdAt')
        .lean(),
      SupportRequest.aggregate<{
        total: number;
        resolved: number;
        rejected: number;
        pending: number;
        inReview: number;
        withAttachments: number;
      }>([
        {
          $group: {
            _id: null,
            total:            { $sum: 1 },
            resolved:         { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
            rejected:         { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
            pending:          { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            inReview:         { $sum: { $cond: [{ $eq: ['$status', 'In Review'] }, 1, 0] } },
            withAttachments:  { $sum: { $cond: [{ $gt: [{ $size: '$followUps' }, 0] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = totals[0] ?? {
      total: 0, resolved: 0, rejected: 0, pending: 0, inReview: 0, withAttachments: 0,
    };

    const byStatus = VALID_STATUSES.reduce<Record<string, number>>((acc, s) => {
      const found = byStatusRows.find((r) => r._id === s);
      acc[s] = found?.count ?? 0;
      return acc;
    }, {});

    const byIssueType = Object.keys(ISSUE_CONFIGS).reduce<Record<string, number>>((acc, k) => {
      const found = byIssueTypeRows.find((r) => r._id === k);
      acc[k] = found?.count ?? 0;
      return acc;
    }, {});

    res.json({
      totals: stats,
      byStatus,
      byIssueType,
      byDay: byDayRows.reverse(), // ascending date order for charts
      recent,
    });
  } catch (err) {
    logger.error(`[support] getSupportAnalytics failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support analytics.' });
  }
}

// Re-export invalidate so callers (e.g. /api/support mount in server.ts)
// can clear caches if needed. Currently unused; kept for symmetry.
export { invalidateFeatureFlagCache };
// Avoid "unused" warning for the cached import
void invalidatePublicCaches;
