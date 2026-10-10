import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cardClass = 'rounded-[1.75rem] bg-paper p-5 shadow-[0_1px_2px_rgba(23,21,15,0.06),0_8px_24px_-12px_rgba(23,21,15,0.12)] sm:p-6';
export const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
export const pressable = 'transition-transform duration-150 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100';
export const primaryButton = `rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40 ${focusRing} ${pressable}`;
export const quietButton = `rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-ink disabled:opacity-40 ${focusRing} ${pressable}`;
export const fieldClass = `min-w-0 flex-1 rounded-full bg-zinc-100 px-3 py-2 text-sm text-ink placeholder:text-zinc-400 ${focusRing}`;

export function IconButton({
  label,
  children,
  className = '',
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      {...props}
      type={type ?? 'button'}
      aria-label={label}
      className={`grid h-10 w-10 place-items-center rounded-full text-ink ${focusRing} ${pressable} ${className}`}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-[15px] font-semibold text-ink text-balance ${className}`}>{children}</h2>;
}
