import { useState, type FormEvent } from 'react';
import { fieldClass, primaryButton } from './ui';

export function PasscodeForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        setError('That passcode is not right.');
        return;
      }
      onUnlocked();
    } catch {
      setError('The household could not be reached.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <h2 id="home-passcode-title" className="text-base font-semibold text-ink text-balance">Unlock your household</h2>
      <label htmlFor="home-passcode" className="block text-sm text-ink">Household passcode</label>
      <input
        id="home-passcode"
        type="password"
        autoComplete="off"
        autoFocus
        value={passcode}
        onChange={(event) => setPasscode(event.target.value)}
        className={`${fieldClass} w-full`}
      />
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      <button type="submit" disabled={pending || !passcode} className={`${primaryButton} w-full`}>
        Unlock
      </button>
    </form>
  );
}
