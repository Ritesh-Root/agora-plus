import { randomUUID } from 'crypto';

export type ApprovalKind = 'forget' | 'start_run';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

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
  if (action.status !== 'pending') return { ok: false, error: 'resolved', approval: action };
  if (decision === 'reject') {
    action.status = 'rejected';
    return { ok: true, approval: action };
  }
  action.status = 'approved';
  const handler = handlers.get(action.kind);
  if (!handler) return { ok: true, approval: action };
  try {
    const result = await handler(action.payload);
    return { ok: true, approval: action, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The action failed.';
    return { ok: false, error: message, approval: action };
  }
}

export function listPendingApprovals(now: () => Date = () => new Date()): PendingAction[] {
  const pending: PendingAction[] = [];
  for (const action of approvals.values()) {
    expireIfNeeded(action, now);
    if (action.status === 'pending') pending.push(action);
  }
  return pending;
}
