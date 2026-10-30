/**
 * Server-rendered markup checks. The repo runs vitest in node without a DOM library, so the
 * interactive flow (pick an occasion, ask, open the result) is covered by e2e/taste.spec.ts.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COUNCIL_RESULT, TASTE_MEMBERS } from './tasteFixture';
import { TasteCard } from './TasteCard';
import { CouncilView } from './TasteSheet';
import type { TasteLoad } from './useTaste';

const noop = async () => null;

function card(load: TasteLoad | null, extra: Partial<Parameters<typeof TasteCard>[0]> = {}) {
  return renderToStaticMarkup(
    <TasteCard load={load} recent={[]} pending={false} error={null} now={Date.parse('2026-10-31T10:05:00.000Z')} onAsk={noop} onOpen={() => {}} onRetry={() => {}} {...extra} />,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('TasteCard', () => {
  it('hides itself when the route is not deployed or the house is locked', () => {
    expect(card({ kind: 'missing' })).toBe('');
    expect(card({ kind: 'locked' })).toBe('');
  });

  it('says it is unavailable on other failures, with a retry', () => {
    const html = text(card({ kind: 'failed' }));
    expect(html).toContain('Taste Council unavailable');
    expect(html).toContain('Try again');
  });

  it('shows members as pressed toggles, six labelled occasions, and the Qloo label', () => {
    const html = card({ kind: 'ready', snapshot: { members: TASTE_MEMBERS, qlooReady: true, recent: [] } });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html).toContain('aria-labelledby="taste-title"');
    expect(text(html)).toContain('Powered by Qloo');
    expect(text(html)).not.toContain('Qloo not connected');
    expect(text(html)).toContain('Encanto · Moana · Coco');
    expect(text(html)).toContain('Keeper watches: vegetarian');
    expect(text(html)).toContain('aggregate cultural affinities, not predictions');
    // Movie night is the default, so there is no location field yet.
    expect(html).not.toContain('City or neighbourhood');
    expect(text(html)).toContain('Ask the council');
  });

  it('flags a missing Qloo connection and disables asking with nobody saved', () => {
    const html = card({ kind: 'ready', snapshot: { members: [], qlooReady: false, recent: [] } });
    expect(text(html)).toContain('Qloo not connected');
    expect(text(html)).toContain('No favourites saved yet');
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });

  it('shows the pending copy and recent councils', () => {
    const html = text(card({ kind: 'ready', snapshot: { members: TASTE_MEMBERS, qlooReady: true, recent: [] } }, { pending: true, recent: [COUNCIL_RESULT] }));
    expect(html).toContain('The council is meeting');
    expect(html).toContain('Asking Qloo about Mia…');
    expect(html).toContain('Keeper is checking diets and allergies…');
    expect(html).toContain('Recent councils');
    expect(html).toContain('Coco');
    expect(html).toContain('Lowest fit: Dadi #3');
    expect(html).toContain('5 min ago');
  });

  it('shows a request error as an alert', () => {
    const html = card({ kind: 'ready', snapshot: { members: TASTE_MEMBERS, qlooReady: true, recent: [] } }, { error: 'The council could not reach Qloo.' });
    expect(html).toMatch(/role="alert"[^>]*>The council could not reach Qloo\./);
  });
});

describe('CouncilView', () => {
  it('leads with the speech and the winner, with per-person ranks and the lowest fit', () => {
    const html = renderToStaticMarkup(<CouncilView result={COUNCIL_RESULT} onAddTask={async () => true} />);
    const plain = text(html);
    expect(plain.indexOf('Coco works for everyone')).toBeLessThan(plain.indexOf('Council pick'));
    expect(plain).toContain('Lowest fit: Dadi #3 of 12');
    expect(plain).toContain('#1 of 12');
    expect(plain).toContain('because they love Encanto and Moana');
    expect(plain).toContain('Every other option leaves someone at #9 or lower');
    expect(plain).toContain('Also considered');
    expect(plain).toContain('Lagaan');
    expect(plain).toContain('Mia #9 (lowest fit)');
    expect(plain).toContain('Add “Movie night: Coco” to to-do');
  });

  it('lists Keeper vetoes with the quoted fact', () => {
    const plain = text(renderToStaticMarkup(<CouncilView result={COUNCIL_RESULT} />));
    expect(plain).toContain('Keeper removed');
    expect(plain).toContain('Chicken Run because “Arjun is vegetarian”');
  });

  it('lists every Qloo call with its args as compact JSON', () => {
    const html = renderToStaticMarkup(<CouncilView result={COUNCIL_RESULT} />);
    const plain = text(html);
    expect(plain).toContain('Qloo calls');
    expect(plain).toContain('2 calls · 1 failed · 2.2 s');
    expect(plain).toContain('qloo_rank for Dadi');
    expect(html).toContain('{&quot;query&quot;:&quot;Encanto&quot;,&quot;types&quot;:[&quot;movie&quot;]}');
  });

  it('states a degraded or failed council plainly', () => {
    const degraded = text(renderToStaticMarkup(<CouncilView result={{ ...COUNCIL_RESULT, status: 'degraded', note: 'Qloo did not answer for Dadi.' }} />));
    expect(degraded).toContain('Some Qloo calls failed. Qloo did not answer for Dadi.');
    const failed = text(renderToStaticMarkup(<CouncilView result={{ ...COUNCIL_RESULT, status: 'error', picks: [], vetoes: [], note: 'Qloo is unreachable.' }} />));
    expect(failed).toContain('Qloo could not answer. Qloo is unreachable.');
    expect(failed).not.toContain('Council pick');
    expect(failed).not.toContain('to-do');
  });
});
