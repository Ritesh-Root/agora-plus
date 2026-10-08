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

  it('puts a failed approval back to pending and does not run it twice at once', async () => {
    let calls = 0;
    registerApprovalHandler('start_run', async () => {
      calls += 1;
      return { ok: false, error: 'A run is already in progress.' };
    });
    const pending = requestApproval('start_run', 'Start dinner', { goal: 'dinner' });
    const failed = await resolveApproval(pending.id, 'approve');
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toBe('A run is already in progress.');
    expect(pending.status).toBe('pending');
    expect(listPendingApprovals()).toHaveLength(1);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    registerApprovalHandler('forget', async () => {
      calls += 1;
      await gate;
      throw new Error('Memory not found.');
    });
    const waiting = requestApproval('forget', 'Forget peanuts', { id: 'm1' });
    const first = resolveApproval(waiting.id, 'approve');
    try {
      const second = await resolveApproval(waiting.id, 'approve');
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error).toBe('running');
      expect(calls).toBe(2);
    } finally {
      release();
    }
    const thrown = await first;
    expect(thrown.ok).toBe(false);
    expect(waiting.status).toBe('pending');
    expect(calls).toBe(2);
    const retried = await resolveApproval(waiting.id, 'approve');
    expect(retried.ok).toBe(false);
    expect(calls).toBe(3);
  });
});
