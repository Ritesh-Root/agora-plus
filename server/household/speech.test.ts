import { describe, expect, it } from 'vitest';
import { toSpeech } from './speech';

describe('toSpeech', () => {
  it('strips Markdown and bare URLs and keeps two sentences', () => {
    const spoken = toSpeech('# Hello\n\nThis is **bold** and a [link](https://example.com/x). See https://example.com/y now. Third sentence stays off.');
    expect(spoken).not.toContain('#');
    expect(spoken).not.toContain('**');
    expect(spoken).not.toContain('https://');
    expect(spoken).toContain('link');
    expect(spoken).toContain('bold');
    expect(spoken).not.toContain('Third');
  });

  it('drops fenced code and list markers', () => {
    const spoken = toSpeech('Before\n```\nsecret code\n```\n- apples\n- pears');
    expect(spoken).not.toContain('secret');
    expect(spoken).not.toMatch(/^[-*]/);
    expect(spoken).toContain('apples');
    expect(spoken).toContain('pears');
  });

  it('cuts at a word boundary under the character cap', () => {
    const spoken = toSpeech('alpha beta gamma delta epsilon.', { maxSentences: 1, maxChars: 12 });
    expect(spoken).toBe('alpha beta');
    expect(spoken.length).toBeLessThanOrEqual(12);
  });

  it('drops a whole sentence before cutting one mid-thought', () => {
    const first = 'This week has lentil soup, stir-fry, and peanut-free falafel wraps for everyone at home tonight.';
    const spoken = toSpeech(`${first} All dishes are carefully chosen to ensure that nobody at the table is left out.`, { maxChars: 120 });
    expect(spoken).toBe(first);
  });
});
