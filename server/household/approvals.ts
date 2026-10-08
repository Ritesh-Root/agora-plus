import { randomUUID } from 'crypto';

export type ApprovalKind = 'forget' | 'start_run';
export type ApprovalStatus = 'pending' | 'running' | 'approved' | 'rejected' | 'expired';

export interface PendingAction {
  id: string;
  kind: ApprovalKind;
  summary: string;
  payload: unknown;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
}

export type ApprovalHandler = (payload: unknown) => Promise<unknown> | unknown;

const TTL_MS = 10 * 60 * 1000;

const handlers = new Map<ApprovalKind, ApprovalHandler>();
const approvals = new Map<string, PendingAction>();

/** Clears in-memory approvals. Tests use this between cases. */
export function resetApprovals(): void {
  approvals.clear();
  handlers.clear();
}

/** Drops waiting approvals and leaves the handlers registered. */
export function clearPendingApprovals(): void {
  approvals.clear();
}

export function registerApprovalHandler(kind: ApprovalKind, handler: ApprovalHandler): void {
  handlers.set(kind, handler);
}

function expireIfNeeded(action: PendingAction, now: () => Date): void {
  if (action.status !== 'pending') return;
  if (now().getTime() >= Date.parse(action.expiresAt)) action.status = 'expired';
}

export function requestApproval(
  kind: ApprovalKind,
  summary: string,
  payload: unknown,
  now: () => Date = () => new Date(),
): PendingAction {
  const created = now();
  const action: PendingAction = {
    id: randomUUID(),
    kind,
    summary,
    payload,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + TTL_MS).toISOString(),
    status: 'pending',
  };
  approvals.set(action.id, action);
  return action;
}

export async function resolveApproval(
  id: string,
  decision: 'approve' | 'reject',
  now: () => Date = () => new Date(),
): Promise<{ ok: true; approval: PendingAction; result?: unknown } | { ok: false; error: 'missing' | 'expired' | 'resolved' | string; approval?: PendingAction }> {
  const action = approvals.get(id);
  if (!action) return { ok: false, error: 'missing' };
  expireIfNeeded(action, now);
  if (action.status === 'expired') return { ok: false, error: 'expired', approval: action };
  if (action.status === 'running') return { ok: false, error: 'running', approval: action };
  if (action.status !== 'pending') return { ok: false, error: 'resolved', approval: action };
  if (decision === 'reject') {
    action.status = 'rejected';
    return { ok: true, approval: action };
  }
  const handler = handlers.get(action.kind);
  if (!handler) {
    action.status = 'approved';
    return { ok: true, approval: action };
  }
  // Claim the approval before the await so a second yes cannot run the action twice.
  action.status = 'running';
  try {
    const result = await handler(action.payload);
    const failure = failedResult(result);
    if (failure) {
      action.status = 'pending';
      return { ok: false, error: failure, approval: action };
    }
    action.status = 'approved';
    return { ok: true, approval: action, result };
  } catch (error) {
    action.status = 'pending';
    const message = error instanceof Error ? error.message : 'The action failed.';
    return { ok: false, error: message, approval: action };
  }
}

function failedResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as { ok?: unknown; error?: unknown };
  if (record.ok !== false) return null;
  return typeof record.error === 'string' && record.error.trim() ? record.error : 'The action failed.';
}

export function listPendingApprovals(now: () => Date = () => new Date()): PendingAction[] {
  const pending: PendingAction[] = [];
  for (const action of approvals.values()) {
    expireIfNeeded(action, now);
    if (action.status === 'pending') pending.push(action);
  }
  return pending;
}
