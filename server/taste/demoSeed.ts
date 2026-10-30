import { addTask, remember } from '../household/actions';
import { listMemory } from '../household/memoryStore';

/**
 * A fictional demo family for the Taste Council. Written only when AGORA_DEMO_SEED=1 and memory is
 * empty, through the normal memory write path (source 'agent'), tagged demo so it is easy to find
 * and forget. None of these people are real.
 */
export const DEMO_FAMILY: { who: string; fact: string; tags: string[] }[] = [
  { who: 'Mia', fact: 'Mia is 9 years old', tags: ['demo', 'taste'] },
  { who: 'Mia', fact: 'Mia loves Encanto, Coco and Taylor Swift', tags: ['demo', 'taste'] },
  { who: 'Mia', fact: 'Mia is allergic to peanuts', tags: ['demo', 'allergy'] },
  { who: 'Arjun', fact: 'Arjun is 41', tags: ['demo', 'taste'] },
  { who: 'Arjun', fact: 'Arjun loves A. R. Rahman and Interstellar', tags: ['demo', 'taste'] },
  { who: 'Arjun', fact: 'Arjun likes thrillers', tags: ['demo', 'taste'] },
  { who: 'Arjun', fact: 'Arjun is vegetarian', tags: ['demo', 'diet'] },
  { who: 'Dadi', fact: 'Dadi is 74', tags: ['demo', 'taste'] },
  { who: 'Dadi', fact: 'Dadi loves Raj Kapoor films, Lata Mangeshkar and Mughal-e-Azam', tags: ['demo', 'taste'] },
  { who: 'Rohan', fact: 'Rohan is 16', tags: ['demo', 'taste'] },
  { who: 'Rohan', fact: 'Rohan loves Spider-Man: Into the Spider-Verse and Arijit Singh', tags: ['demo', 'taste'] },
  { who: 'Rohan', fact: 'Rohan likes street food', tags: ['demo', 'taste'] },
];

export function demoSeedEnabled(): boolean {
  return process.env.AGORA_DEMO_SEED?.trim() === '1';
}

/** Returns how many facts were written. Never throws; failures are logged. */
export async function seedDemoFamily(options: { force?: boolean } = {}): Promise<number> {
  if (!options.force && !demoSeedEnabled()) return 0;
  try {
    if ((await listMemory()).length > 0) return 0;
    let written = 0;
    for (const item of DEMO_FAMILY) {
      const saved = await remember(item.fact, item.tags, 'agent', item.who);
      if (saved.ok && saved.created) written += 1;
    }
    await addTask('Pick a film for Saturday family movie night', undefined, 'agent', { who: 'Arjun' });
    console.log(`[taste] Seeded a fictional demo family (Mia, Arjun, Dadi, Rohan): ${written} facts.`);
    return written;
  } catch (error) {
    console.error('[taste] Demo seed failed:', error instanceof Error ? error.message : 'unknown error');
    return 0;
  }
}

let started: Promise<number> | null = null;

/** Startup hook: runs once per process. */
export function seedDemoFamilyOnce(): Promise<number> {
  if (!started) started = seedDemoFamily();
  return started;
}
