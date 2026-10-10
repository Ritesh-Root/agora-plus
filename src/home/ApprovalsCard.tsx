import type { ApprovalItem } from '../interface/householdView';
import { planSteps } from './homeView';
import { primaryButton, quietButton } from './ui';

export function ApprovalsCard({
  approvals: all,
  hideId,
  onDecide,
}: {
  approvals: ApprovalItem[];
  /** The approval the assistant card is already asking about. */
  hideId?: string;
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<boolean>;
}) {
  const approvals = all.filter((approval) => approval.id !== hideId);
  if (approvals.length === 0) return null;
  return (
    <section className="space-y-3 rounded-[1.75rem] bg-butter/20 p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-ink text-balance">Waiting for you</h2>
      <ul className="space-y-4">
        {approvals.map((approval) => {
          const steps = planSteps(approval.summary);
          return (
            <li key={approval.id}>
              {steps ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                  {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-ink">{approval.summary}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void onDecide(approval.id, 'approve')} className={primaryButton}>Approve</button>
                <button type="button" onClick={() => void onDecide(approval.id, 'reject')} className={quietButton}>Decline</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
