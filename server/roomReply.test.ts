import { describe, expect, it } from 'vitest';
import { canSeeChat, parseRoomMentions, readAgentAccess, sanitizeChatAgents, sanitizeTeamAgents } from '../shared/mentions';
import { runRoomDiscussion } from './roomReply';
import type { LLMLike } from './society/provider';

const team = [
  { name: 'Film Director', description: 'Leads the shoot.' },
  { name: 'Visual Lead', description: 'Frames the shots.' },
];

describe('room mentions', () => {
  it('treats @all as the whole room and @Name as one teammate', () => {
    expect(parseRoomMentions('hey @all look at this', team).all).toBe(true);
    expect(parseRoomMentions('@Film Director can you frame this?', team)).toEqual({
      all: false,
      names: ['Film Director'],
    });
    expect(parseRoomMentions('@allen is not the team', team).all).toBe(false);
  });

  it('keeps a direct message with the sender only', () => {
    const direct = {
      id: '1',
      playerId: 'human',
      name: 'Ritesh',
      text: '@Film Director hello',
      timestamp: 1,
      audience: 'direct' as const,
      forPlayerId: 'human',
    };
    expect(canSeeChat(direct, 'human')).toBe(true);
    expect(canSeeChat(direct, 'guest')).toBe(false);
    expect(canSeeChat({ ...direct, audience: 'room', forPlayerId: undefined }, 'guest')).toBe(true);
  });

  it('drops a bogus agent list', () => {
    expect(sanitizeChatAgents([{ name: '  Film Director  ', description: 'Leads.' }, { name: 'all' }, { name: '' }]))
      .toEqual([{ name: 'Film Director', description: 'Leads.' }]);
  });

  it('keeps an agent key for routing and off the prompt team', () => {
    const raw = [{ name: 'Writer', description: 'Writes.', model: 'model-b', baseUrl: 'https://b.example/v1', apiKey: 'key-b' }];
    expect(sanitizeTeamAgents(raw)).toEqual([{ name: 'Writer', description: 'Writes.', model: 'model-b' }]);
    expect(sanitizeChatAgents(raw)).toEqual([{ name: 'Writer', description: 'Writes.', model: 'model-b' }]);
    expect(readAgentAccess(raw)).toEqual([{
      name: 'Writer',
      model: 'model-b',
      baseUrl: 'https://b.example/v1',
      apiKey: 'key-b',
      own: true,
    }]);
    expect(JSON.stringify(sanitizeTeamAgents(raw))).not.toContain('key-b');
  });
});

describe('room discussion', () => {
  it('lets the next teammate see the previous reply', async () => {
    const lines: string[] = ['Ritesh: @all plan a short film'];
    const seen: string[] = [];
    const provider: LLMLike = {
      async generateCompletion(messages) {
        seen.push(messages[0].content);
        const name = messages[0].content.endsWith('Film Director.') ? 'Film Director' : 'Visual Lead';
        return { content: `${name} speaking.` };
      },
    };
    const replies = await runRoomDiscussion({
      speakers: team,
      teammates: team,
      provider,
      transcript: () => lines.join('\n'),
      post: (name, text) => lines.push(`${name}: ${text}`),
      model: 'deepseek-v4.1-flash',
    });
    expect(replies.map((reply) => reply.name)).toEqual(['Film Director', 'Visual Lead']);
    expect(seen[1]).toContain('Film Director speaking.');
  });

  it('posts each distinct error once, after the pass, and keeps it out of later prompts', async () => {
    const lines: string[] = ['Ritesh: @all plan a short film'];
    const seen: string[] = [];
    const speakers = [...team, { name: 'Editor', description: 'Cuts.' }];
    const provider: LLMLike = {
      async generateCompletion(messages) {
        seen.push(messages[0].content);
        if (messages[0].content.endsWith('Editor.')) return { content: 'Editor speaking.' };
        throw new Error('Inference API error (401): bad key');
      },
    };
    const replies = await runRoomDiscussion({
      speakers,
      teammates: speakers,
      provider,
      transcript: () => lines.join('\n'),
      post: (name, text) => lines.push(`${name}: ${text}`),
    });
    expect(replies.map((reply) => reply.name)).toEqual(['Editor']);
    expect(seen[2]).not.toContain('API key was rejected');
    expect(lines.slice(1)).toEqual(['Editor: Editor speaking.', 'Film Director: The API key was rejected.']);
  });
});
