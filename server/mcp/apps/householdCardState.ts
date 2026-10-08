export function failedCardState(message: string): {
  speech: string;
  items: string[];
  tasks: [];
  approvals: [];
  note: string;
} {
  const text = message.trim() || 'The household could not be loaded.';
  return { speech: text, items: [], tasks: [], approvals: [], note: text };
}

export interface CardTask {
  title: string;
  who?: string;
  due?: string;
  dueAt?: string;
  list?: string;
}

function localDue(dueAt: string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One line for the Echo card. List and person show up when the task has them. */
export function describeTask(task: CardTask, formatDue: (iso: string) => string = localDue): string {
  const list = task.list?.trim();
  const listLabel = list
    ? (list.toLowerCase() === 'shopping' ? 'Shopping' : list.charAt(0).toUpperCase() + list.slice(1))
    : '';
  const who = task.who?.trim();
  const head = `${who ? `${who}: ` : ''}${listLabel ? `${listLabel}: ` : ''}${task.title}`;
  const when = task.dueAt?.trim() ? formatDue(task.dueAt) : task.due?.trim();
  return when ? `${head} (due ${when})` : head;
}
