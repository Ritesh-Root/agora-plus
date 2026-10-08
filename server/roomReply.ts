import type { MentionAgent } from '../shared/mentions';
import { publicModelError } from './modelError';
import type { LLMLike } from './society/provider';

/**
 * One pass of the team talking in the room.
 * Each speaker sees the transcript at the moment they talk, so a person
 * who types during the pass is included in the later replies.
 * A failed speaker is skipped, and each distinct error is posted once after the pass,
 * so later speakers are never prompted with an error as if a teammate said it.
 */
export async function runRoomDiscussion(options: {
  speakers: MentionAgent[];
  teammates: MentionAgent[];
  provider: LLMLike;
  model?: string;
  transcript: () => string;
  post: (name: string, text: string) => void;
}): Promise<Array<{ name: string; text: string }>> {
  const posted: Array<{ name: string; text: string }> = [];
  const errors = new Map<string, string>();
  for (const speaker of options.speakers) {
    const others = options.teammates
      .filter((agent) => agent.name !== speaker.name)
      .map((agent) => agent.name)
      .join(', ');
    const group = options.speakers.length > 1;
    const system = group
      ? [
          `You are ${speaker.name}. ${speaker.description}`,
          others ? `Your teammates in this room are ${others}.` : 'You are speaking with the human.',
          'The whole session can see this. Discuss the idea with your teammates before any project starts. Do not write the deliverable.',
          'At most 3 sentences. Address a teammate by name when you answer them. The human may jump in between turns.',
        ].join(' ')
      : [
          `You are ${speaker.name}. ${speaker.description}`,
          'The human wrote only to you. Other people in the session cannot see this. Answer them directly.',
          'This is a conversation before any project starts. Do not write the deliverable. At most 3 sentences.',
        ].join(' ');
    const transcript = options.transcript().trim();
    const tagged = options.provider as LLMLike & { prepareRequest?: (info: { stage: string; agent: string; attempt?: number }) => void };
    tagged.prepareRequest?.({ stage: 'chat', agent: speaker.name, attempt: 1 });
    let text = '';
    try {
      const result = await options.provider.generateCompletion(
        [{ role: 'user', content: `Conversation so far:\n${transcript}\n\nReply as ${speaker.name}.` }],
        undefined,
        system,
        speaker.model || options.model,
      );
      text = (result.content || '').trim().slice(0, 600);
    } catch (error) {
      const message = publicModelError(error);
      if (!errors.has(message)) errors.set(message, speaker.name);
      continue;
    }
    if (!text) continue;
    posted.push({ name: speaker.name, text });
    options.post(speaker.name, text);
  }
  for (const [message, name] of errors) options.post(name, message);
  return posted;
}
