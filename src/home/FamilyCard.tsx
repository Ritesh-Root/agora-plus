import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { House, Pencil, Trash2 } from 'lucide-react';
import type { MemoryItem } from '../interface/householdView';
import { groupMemory, personTint, safetyKind } from './homeView';
import { cardClass, fieldClass, focusRing, IconButton, quietButton, SectionTitle } from './ui';

const BADGE: Record<string, string> = {
  allergy: 'bg-coral/10 text-coral',
  medical: 'bg-coral/10 text-coral',
  diet: 'bg-sage/15 text-sage',
};

const BADGE_LABEL = { allergy: 'Allergy', medical: 'Medical', diet: 'Diet' };

/** Edit and delete show on hover or focus where there is a mouse; touch screens always show them. */
const REVEAL = 'transition-opacity duration-150 motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100';

export function FamilyCard({
  memory,
  onAdd,
  onPatch,
  onDelete,
}: {
  memory: MemoryItem[];
  onAdd: (text: string) => Promise<boolean>;
  onPatch: (id: string, text: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const groups = groupMemory(memory);

  useEffect(() => {
    if (!pendingDelete && !editing) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (pendingDelete) setPendingDelete(null);
      else setEditing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, pendingDelete]);

  const startEdit = (entry: MemoryItem) => {
    setPendingDelete(null);
    setEditing(entry.id);
    setEditText(entry.text);
  };

  const save = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    const ok = await onPatch(id, text);
    if (ok) setEditing(null);
  };

  const onEditKey = (event: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setEditing(null);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void save(id);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const ok = await onAdd(text);
    if (ok) setDraft('');
  };

  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="space-y-1">
        <SectionTitle>Family</SectionTitle>
        <p className="text-[13px] text-zinc-500">What AGORA+ remembers about each person. Click a fact to change it.</p>
      </div>
      {groups.length === 0 ? <p className="text-sm text-zinc-500">Nothing saved yet. Try "Remember Mia is allergic to peanuts".</p> : null}
      <div className="divide-y divide-ink/5">
        {groups.map((group) => (
          <div key={group.who} className="py-3 first:pt-0">
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-medium text-ink"
                style={{ backgroundColor: personTint(group.who) }}
                aria-hidden="true"
              >
                {group.who === 'Home' ? <House size={16} strokeWidth={1.75} /> : group.who.charAt(0).toUpperCase()}
              </span>
              <p className="text-sm font-medium text-ink">{group.who === 'Home' ? 'Everyone' : group.who}</p>
            </div>
            <ul className="mt-1 pl-8">
              {group.facts.map((entry) => {
                const kind = safetyKind(entry.text, entry.tags);
                return (
                  <li key={entry.id} className="group flex items-center gap-0.5">
                    {editing === entry.id ? (
                      <input
                        aria-label="Memory text"
                        value={editText}
                        autoFocus
                        onChange={(event) => setEditText(event.target.value)}
                        onKeyDown={(event) => onEditKey(event, entry.id)}
                        onBlur={() => setEditing((current) => (current === entry.id ? null : current))}
                        className={fieldClass}
                      />
                    ) : (
                      <button type="button" onClick={() => startEdit(entry)} className={`min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left text-sm text-ink text-pretty hover:bg-zinc-50 ${focusRing}`}>
                        {kind ? <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[12px] font-medium ${BADGE[kind]}`}>{BADGE_LABEL[kind]}</span> : null}
                        {entry.text}
                      </button>
                    )}
                    {pendingDelete === entry.id ? (
                      <span className="inline-flex h-10 shrink-0 items-center gap-3 pl-1 text-[13px] text-ink">
                        Delete?
                        <button type="button" onClick={() => void onDelete(entry.id).then((ok) => { if (ok) setPendingDelete(null); })} className={`font-medium text-coral ${focusRing}`}>Yes</button>
                        <button type="button" onClick={() => setPendingDelete(null)} className={focusRing}>No</button>
                      </span>
                    ) : (
                      <span className={`flex shrink-0 text-zinc-500 ${REVEAL}`}>
                        <IconButton label={`Edit ${entry.text}`} onClick={() => startEdit(entry)}>
                          <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                        </IconButton>
                        <IconButton label={`Delete ${entry.text}`} onClick={() => setPendingDelete(entry.id)}>
                          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                        </IconButton>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <form onSubmit={(event) => void add(event)} className="flex gap-2">
        <input aria-label="Add a fact" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a fact, like “Sam hates mushrooms”" className={fieldClass} />
        <button type="submit" disabled={!draft.trim()} className={quietButton}>Add</button>
      </form>
    </section>
  );
}
