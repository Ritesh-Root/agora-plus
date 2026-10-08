import { beforeEach, describe, expect, it } from 'vitest';
import { listPendingApprovals, registerApprovalHandler, requestApproval, resetApprovals, resolveApproval } from './approvals';

beforeEach(() => {
  resetApprovals();
});

describe('approvals', () => {
  it('runs the handler once on approve and not on reject', async () => {
    let calls = 0;
    registerApprovalHandler('forget', () => {
      calls += 1;
      return 'gone';
    });
    const now = () => new Date('2026-10-08T12:00:00.000Z');
    const pending = requestApproval('forget', 'Forget peanuts', { id: 'm1' }, now);
    const approved = await resolveApproval(pending.id, 'approve', now);
    const again = await resolveApproval(pending.id, 'approve', now);
    expect(calls).toBe(1);
    expect(approved.ok && approved.result).toBe('gone');
    expect(again.ok).toBe(false);

    const rejected = requestApproval('forget', 'Forget milk', { id: 'm2' }, now);
    const denial = await resolveApproval(rejected.id, 'reject', now);
    expect(calls).toBe(1);
    expect(denial.ok && denial.approval.status).toBe('rejected');
    expect(listPendingApprovals(now)).toHaveLength(0);
  });

  it('expires with a fake clock and does not run the handler', async () => {
    let calls = 0;
    registerApprovalHandler('start_run', () => {
      calls += 1;
    });
    let clock = new Date('2026-10-08T12:00:00.000Z');
    const now = () => clock;
    const pending = requestApproval('start_run', 'Start dinner', { goal: 'dinner' }, now);
    clock = new Date(clock.getTime() + 10 * 60 * 1000);
    const resolved = await resolveApproval(pending.id, 'approve', now);
    expect(calls).toBe(0);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.approval?.status).toBe('expired');
    expect(listPendingApprovals(now)).toHaveLength(0);
  });
});
