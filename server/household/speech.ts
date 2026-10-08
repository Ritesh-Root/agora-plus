export interface SpeechOptions {
  maxSentences?: number;
  maxChars?: number;
}

function stripMarkdown(text: string): string {
  let current = text.replace(/\r\n/g, '\n');
  current = current.replace(/```[\s\S]*?```/g, ' ');
  current = current.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  current = current.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  current = current.replace(/^#{1,6}\s+/gm, '');
  current = current.replace(/^\s*>\s?/gm, '');
  current = current.replace(/^\s*([-*+]|\d+[.)])\s+/gm, '');
  current = current.replace(/`([^`]*)`/g, '$1');
  for (let pass = 0; pass < 4; pass += 1) {
    const next = current.replace(/(\*\*|__|~~|\*|_)([\s\S]+?)\1/g, '$2');
    if (next === current) break;
    current = next;
  }
  current = current.replace(/[*_~#]+/g, '');
  current = current.replace(/https?:\/\/[^\s)>]+/gi, '');
  return current.replace(/\s+/g, ' ').trim();
}

function sentencesOf(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!matches) return text ? [text] : [];
  return matches.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Short text safe to speak: no Markdown, no bare URLs, at most a couple of sentences. */
export function toSpeech(text: string, options: SpeechOptions = {}): string {
  const maxSentences = options.maxSentences ?? 2;
  const maxChars = options.maxChars ?? 220;
  const plain = stripMarkdown(text);
  if (!plain || maxSentences <= 0 || maxChars <= 0) return '';
  const kept = sentencesOf(plain).slice(0, maxSentences).join(' ').trim();
  if (kept.length <= maxChars) return kept;
  const slice = kept.slice(0, maxChars);
  const boundary = slice.lastIndexOf(' ');
  return (boundary > 0 ? slice.slice(0, boundary) : slice).trim();
}
