import { ACK_PHRASES, acknowledge } from './ack';
import { describe, expect, it } from 'vitest';

describe('acknowledge', () => {
  it('uses only the fixed phrases', () => {
    expect(new Set(ACK_PHRASES).size).toBe(ACK_PHRASES.length);
    const samples = [
      'remember the milk',
      'plan dinners',
      "what's my briefing?",
      'yes',
      'no',
      'what is Mia allergic to?',
      'hello',
    ];
    for (const sample of samples) {
      expect(ACK_PHRASES).toContain(acknowledge(sample));
    }
  });

  it('picks a phrase from the words, in rule order', () => {
    expect(acknowledge('Remember Mia is allergic to peanuts')).toBe('Got it, saving that.');
    expect(acknowledge('take a note that the milk is out')).toBe('Got it, saving that.');
    expect(acknowledge('Plan dinners for this week and add the groceries')).toBe("On it. I'll get the team on that.");
    expect(acknowledge('Please organize Saturday')).toBe("On it. I'll get the team on that.");
    expect(acknowledge('schedule the plumber')).toBe("On it. I'll get the team on that.");
    expect(acknowledge("What's my briefing?")).toBe("Here's your day.");
    expect(acknowledge('How does today look?')).toBe("Here's your day.");
    expect(acknowledge('Yes, go ahead.')).toBe('Okay, going ahead.');
    expect(acknowledge('I approve')).toBe('Okay, going ahead.');
    expect(acknowledge('No, cancel that.')).toBe("Okay, I won't.");
    expect(acknowledge('cancel that')).toBe("Okay, I won't.");
    expect(acknowledge('What is Mia allergic to?')).toBe('Let me check.');
    expect(acknowledge('where are the keys')).toBe('Let me check.');
    expect(acknowledge('Milk?')).toBe('Let me check.');
    expect(acknowledge('hello there')).toBe('On it.');
  });
});
