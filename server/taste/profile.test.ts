import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '../household/memoryStore';
import { ageToBand, classifyItem, parseTasteFact, profileFromEntries } from './profile';

let counter = 0;
function entry(text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry {
  counter += 1;
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString();
  return { id: `m${counter}`, text, tags: [], createdAt: at, updatedAt: at, source: 'ui', ...extra };
}

describe('parseTasteFact', () => {
  it.each([
    ['Mia loves Encanto', 'Mia', ['Encanto'], []],
    ['Dadi loves Raj Kapoor films', 'Dadi', ['Raj Kapoor'], []],
    ['Arjun is a fan of A. R. Rahman', 'Arjun', ['A. R. Rahman'], []],
    ['Arjun is a huge fan of A. R. Rahman.', 'Arjun', ['A. R. Rahman'], []],
    ['Rohan likes thrillers', 'Rohan', [], ['thrillers']],
    ["Mia's favourite movie is Coco", 'Mia', ['Coco'], []],
    ["Mia's favorite singers are Taylor Swift and Olivia Rodrigo", 'Mia', ['Taylor Swift', 'Olivia Rodrigo'], []],
    ['Mia loves Encanto, Coco and Taylor Swift', 'Mia', ['Encanto', 'Coco', 'Taylor Swift'], []],
    ['Rohan likes street food and jazz', 'Rohan', [], ['street food', 'jazz']],
    ['Mia loves Encanto and dancing', 'Mia', ['Encanto'], ['dancing']],
    ['Rohan really likes Spider-Man: Into the Spider-Verse', 'Rohan', ['Spider-Man: Into the Spider-Verse'], []],
    ['Dadi adores "Mughal-e-Azam"', 'Dadi', ['Mughal-e-Azam'], []],
    ['Arjun enjoys watching thrillers', 'Arjun', [], ['thrillers']],
    ['Rohan listens to Arijit Singh', 'Rohan', ['Arijit Singh'], []],
    ['Mia likes to dance', 'Mia', [], ['dance']],
  ])('%s', (text, who, loves, tags) => {
    const parsed = parseTasteFact(text);
    expect(parsed.who).toBe(who);
    expect(parsed.loves).toEqual(loves);
    expect(parsed.likesTags).toEqual(tags);
  });

  it.each([
    ['Dadi is 74', 74],
    ['Mia is 9 years old', 9],
    ['Rohan is 16 years old.', 16],
    ['Arjun is aged 41', 41],
    ['Mia is a 9-year-old', 9],
    ['Rohan turned 16', 16],
  ])('reads the age in %s', (text, age) => {
    expect(parseTasteFact(text).age).toBe(age);
  });

  it.each([
    ['Rohan is vegetarian', ['vegetarian']],
    ['Arjun is a vegan', ['vegan']],
    ['Mia is allergic to peanuts', ['peanuts']],
    ['Mia is allergic to peanuts and shellfish', ['peanuts', 'shellfish']],
    ['Mia has a peanut allergy', ['peanut']],
    ['Arjun hates horror', ['no horror']],
    ['Arjun hates horror films', ['no horror']],
    ["Dadi doesn't eat meat", ['no meat']],
    ['Dadi eats halal', ['halal']],
    ['Mia is scared of clowns', ['no clowns']],
  ])('reads the constraint in %s', (text, constraints) => {
    expect(parseTasteFact(text).constraints).toEqual(constraints);
  });

  it('uses who from the entry and strips a pronoun', () => {
    expect(parseTasteFact('She loves Coco', 'Mia')).toMatchObject({ who: 'Mia', loves: ['Coco'] });
    expect(parseTasteFact("She's 9", 'Mia')).toMatchObject({ who: 'Mia', age: 9 });
    expect(parseTasteFact('Loves Encanto', 'Mia')).toMatchObject({ who: 'Mia', loves: ['Encanto'] });
  });

  it('splits two clauses with the same subject', () => {
    const parsed = parseTasteFact('Arjun loves Interstellar but hates horror');
    expect(parsed.loves).toEqual(['Interstellar']);
    expect(parsed.constraints).toEqual(['no horror']);
  });

  it('ignores facts that are not about taste', () => {
    const parsed = parseTasteFact("Mia's school pickup is at 3pm");
    expect(parsed.loves).toEqual([]);
    expect(parsed.likesTags).toEqual([]);
    expect(parsed.constraints).toEqual([]);
    expect(parsed.age).toBeUndefined();
    expect(parseTasteFact('The spare key is under the mat').who).toBeUndefined();
  });

  it('treats a taste-tagged fact without a verb as a like', () => {
    expect(parseTasteFact('Mia: Encanto', 'Mia', ['taste']).loves).toEqual(['Encanto']);
    expect(parseTasteFact('Bollywood musicals', 'Dadi', ['taste']).loves).toEqual(['Bollywood musicals']);
    expect(parseTasteFact('road trips', 'Arjun', ['taste']).likesTags).toEqual(['road trips']);
  });
});

describe('classifyItem and ageToBand', () => {
  it('classifies named things and concepts', () => {
    expect(classifyItem('Coco')).toEqual({ kind: 'love', value: 'Coco' });
    expect(classifyItem('the Beatles')).toEqual({ kind: 'love', value: 'Beatles' });
    expect(classifyItem('street food')).toEqual({ kind: 'tag', value: 'street food' });
    expect(classifyItem('it')).toBeNull();
  });

  it('bands ages', () => {
    expect(ageToBand(9)).toBe('0-17');
    expect(ageToBand(18)).toBe('18-24');
    expect(ageToBand(41)).toBe('35-44');
    expect(ageToBand(74)).toBe('55+');
    expect(ageToBand(-1)).toBeUndefined();
  });
});

describe('profileFromEntries', () => {
  it('merges facts per person, keeps fact ids, and quotes constraints', () => {
    const facts = [
      entry('Mia loves Encanto', { who: 'Mia' }),
      entry('Mia loves Coco and encanto'),
      entry('Mia is 9 years old'),
      entry('Mia is allergic to peanuts', { tags: ['allergy'] }),
      entry('Dadi is 74'),
      entry('Dadi loves Raj Kapoor films'),
      entry('The spare key is under the mat'),
      entry('Buy milk'),
    ];
    const { members, constraintFacts } = profileFromEntries(facts);
    expect(members.map((member) => member.who)).toEqual(['Dadi', 'Mia']);
    const mia = members.find((member) => member.who === 'Mia')!;
    expect(mia.loves).toEqual(['Encanto', 'Coco']);
    expect(mia.ageBand).toBe('0-17');
    expect(mia.constraints).toEqual(['peanuts']);
    expect(mia.factIds).toEqual([facts[0].id, facts[1].id, facts[2].id, facts[3].id]);
    expect(constraintFacts.get('mia|peanuts')).toBe('Mia is allergic to peanuts');
    const dadi = members.find((member) => member.who === 'Dadi')!;
    expect(dadi).toMatchObject({ loves: ['Raj Kapoor'], ageBand: '55+', likesTags: [], constraints: [] });
  });

  it('merges names case-insensitively', () => {
    const { members } = profileFromEntries([entry('Rohan likes thrillers'), entry('likes street food', { who: 'rohan' })]);
    expect(members).toHaveLength(1);
    expect(members[0].likesTags).toEqual(['thrillers', 'street food']);
  });
});
