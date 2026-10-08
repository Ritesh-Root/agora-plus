import { afterEach, describe, expect, it } from 'vitest';
import { openConversation, resetConversations, saveConversation, setConversationClock, VOICE_SYSTEM } from './conversation';

afterEach(() => {
  resetConversations();
});

describe('conversation store', () => {
  it('expires a conversation after 30 minutes', () => {
    setConversationClock(() => 1_000_000);
    const first = openConversation();
    saveConversation(first, [{ role: 'user', content: 'hello' }]);
    setConversationClock(() => 1_000_000 + 10 * 60 * 1000);
    expect(openConversation(first.id).id).toBe(first.id);
    setConversationClock(() => 1_000_000 + 31 * 60 * 1000);
    const expired = openConversation(first.id);
    expect(expired.id).not.toBe(first.id);
    expect(expired.messages).toEqual([]);
    expect(expired.system).toBe(VOICE_SYSTEM);
    expect(VOICE_SYSTEM.toLowerCase()).not.toContain('approve_action');
  });

  it('starts a new conversation with a short summary after 40 messages', () => {
    setConversationClock(() => 5_000);
    const first = openConversation();
    const messages = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `line ${index}`,
    }));
    saveConversation(first, messages);
    first.tools = [{ name: 'remember', input_schema: { type: 'object' } }];
    const rolled = openConversation(first.id);
    expect(rolled.id).not.toBe(first.id);
    expect(rolled.messages).toHaveLength(1);
    expect(rolled.messages[0]?.role).toBe('user');
    expect(String(rolled.messages[0]?.content)).toContain('line 39');
    expect(rolled.tools).toBeNull();
    expect(rolled.system).toBe(VOICE_SYSTEM);
    expect(openConversation(rolled.id).id).toBe(rolled.id);
  });
});
