import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useOverlay } from './useOverlay';
import { IconButton } from './ui';

export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
  wide = false,
  fill = false,
  modal = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
  wide?: boolean;
  fill?: boolean;
  /**
   * A non-modal sheet leaves the page usable: no backdrop, no focus trap, and Escape stays with the
   * assistant (it stops speech and declines approvals). Under the hood uses this so you can keep
   * talking while the trace fills in.
   */
  modal?: boolean;
}) {
  const panelRef = useOverlay(open && modal, onClose);
  const frame = wide
    ? 'max-lg:inset-x-4 max-lg:top-1/2 max-lg:h-auto max-lg:max-h-[85dvh] max-lg:-translate-y-1/2 max-lg:rounded-[1.75rem] lg:inset-y-0 lg:right-0 lg:max-w-[40rem]'
    : modal
      ? 'inset-y-0 right-0 max-w-[460px]'
      // Below the top bar, so its buttons (including the one that closes this) stay in reach.
      : 'top-16 bottom-0 right-0 max-w-[460px]';
  return (
    <>
      {open && modal ? <div className="fixed inset-0 z-30 bg-[#17150f]/10" onClick={onClose} /> : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open && modal}
        aria-label={title}
        hidden={!open}
        inert={!open ? true : undefined}
        data-testid={testId}
        className={`${open ? 'flex' : 'hidden'} fixed z-40 w-full flex-col bg-paper ${modal ? 'shadow-[0_1px_2px_rgba(23,21,15,0.06),0_8px_24px_-12px_rgba(23,21,15,0.12)]' : 'shadow-[-1px_0_0_rgba(23,21,15,0.08),-16px_0_40px_-24px_rgba(23,21,15,0.25)]'} ${frame}`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
          <h2 className="text-base font-semibold text-ink text-balance">{title}</h2>
          <IconButton label={`Close ${title}`} onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </header>
        <div className={fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-6' : 'min-h-0 flex-1 overflow-y-auto px-5 pb-6'}>{children}</div>
      </div>
    </>
  );
}
