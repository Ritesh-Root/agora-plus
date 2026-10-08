import { describe, expect, it } from 'vitest';
import { normalizeChatText, RoomState, setRoomNetworkOpen } from './roomState';

describe('public room chat', () => {
  it('drops empty and oversized messages', () => {
    expect(normalizeChatText('  hello  ')).toBe('hello');
    expect(normalizeChatText('   ')).toBeNull();
    expect(normalizeChatText('x'.repeat(2001))).toBeNull();
  });

  it('lets the next person in before the 3D office has cabins', () => {
    const room = new RoomState();
    const host = room.join('h', 'Host', '#111');
    const guest = room.join('g', 'Guest', '#222');
    expect(host.ok).toBe(true);
    expect(guest.ok).toBe(true);
    expect(room.registerCabins('g', ['cabin-a', 'cabin-b'])?.map((p) => p.cabinPoiId)).toEqual(['cabin-a', 'cabin-b']);
  });

  it('does not give the host seat to the next person, or to a matching name', () => {
    const room = new RoomState();
    const host = room.join('11111111-1111-1111-1111-111111111111', 'Ritesh', '#111');
    room.join('22222222-2222-2222-2222-222222222222', 'Observer', '#222');
    expect(host.ok && host.hostToken).toBeTruthy();
    const token = host.ok ? host.hostToken : '';

    room.addChat({
      id: 'private',
      playerId: '11111111-1111-1111-1111-111111111111',
      name: 'Ritesh',
      text: 'only the host thread',
      timestamp: 1,
      audience: 'direct',
      forPlayerId: '11111111-1111-1111-1111-111111111111',
    });
    room.leave('11111111-1111-1111-1111-111111111111');

    const sameName = room.join('33333333-3333-3333-3333-333333333333', 'Ritesh', '#111');
    expect(sameName.ok && sameName.info.isHost).toBe(false);
    expect(room.canResume('11111111-1111-1111-1111-111111111111')).toBe(false);
    expect(room.canResume('11111111-1111-1111-1111-111111111111', token)).toBe(true);

    const reclaimed = room.join('11111111-1111-1111-1111-111111111111', 'Ritesh', '#111', token);
    expect(reclaimed.ok && reclaimed.info.isHost).toBe(true);
    expect(room.chatFor('11111111-1111-1111-1111-111111111111').map((entry) => entry.text)).toEqual(['only the host thread']);
    expect(room.chatFor('22222222-2222-2222-2222-222222222222')).toEqual([]);
  });

  it('keeps the latest 100 messages', () => {
    const room = new RoomState();
    for (let i = 0; i < 105; i++) {
      room.addChat({ id: String(i), playerId: 'p', name: 'A', text: String(i), timestamp: i });
    }
    const chat = room.getChat();
    expect(chat).toHaveLength(100);
    expect(chat[0].id).toBe('5');
    expect(chat[99].id).toBe('104');
  });
});

describe('room run', () => {
  it('keeps one active run and ignores a late finish from an older id', () => {
    const room = new RoomState();
    const first = room.beginRun('one');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(room.beginRun('two').ok).toBe(false);
    expect(room.requestCancel(first.run.id)).toBe(true);
    expect(room.cancelRequested(first.run.id)).toBe(true);
    expect(room.markStopped(first.run.id)).toBe(true);
    const second = room.beginRun('two');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(room.finishRun(first.run.id, { status: 'complete', synthesis: 'old' })).toBe(false);
    expect(room.currentRun()?.synthesis).toBe('');
    expect(room.finishRun(second.run.id, { status: 'complete', synthesis: 'new', wordCount: 1 })).toBe(true);
    expect(room.currentRun()?.synthesis).toBe('new');
  });

  it('keeps the host seat for a household session when the process is on the network', () => {
    setRoomNetworkOpen(true);
    try {
      const room = new RoomState();
      const first = room.join('a', 'Ada', '#111');
      expect(first.ok && first.info.isHost).toBe(false);
      const session = room.join('b', 'Bea', '#222', undefined, undefined, true);
      expect(session.ok && session.info.isHost).toBe(true);
      const next = room.join('c', 'Cam', '#333', undefined, undefined, true);
      expect(next.ok && next.info.isHost).toBe(false);
    } finally {
      setRoomNetworkOpen(false);
    }
  });

  it('does not grant host from a display name when a demo secret is set', () => {
    const room = new RoomState({ hostSecret: 'demo-secret' });
    const named = room.join('m', 'Boss', '#111', undefined, 'true');
    expect(named.ok && named.info.isHost).toBe(false);
    expect(room.tryEndSession('m')).toEqual({ ok: false, error: 'Only the room host can end the session.' });
    expect(room.getRoster()).toHaveLength(1);

    const host = room.join('h', 'Visitor', '#222', undefined, 'demo-secret');
    expect(host.ok && host.info.isHost).toBe(true);
    const thief = room.join('t', 'Visitor', '#333', undefined, 'demo-secret');
    expect(thief.ok && thief.info.isHost).toBe(false);
  });

  it('keeps the run after the room empties so a reconnect can restore it', () => {
    const room = new RoomState();
    const host = room.join('h', 'Host', '#111');
    expect(host.ok).toBe(true);
    const begun = room.beginRun('brief');
    expect(begun.ok).toBe(true);
    room.leave('h');
    expect(room.currentRun()?.brief).toBe('brief');
  });

  it('ends the session so a late finish cannot restore the document', () => {
    const room = new RoomState();
    const host = room.join('h', 'Host', '#111');
    expect(host.ok).toBe(true);
    room.addChat({ id: 'c', playerId: 'h', name: 'Host', text: 'hello', timestamp: 1 });
    const begun = room.beginRun('brief');
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const epoch = room.epoch();
    expect(room.tryEndSession('h').ok).toBe(true);
    expect(room.getRoster()).toEqual([]);
    expect(room.getChat()).toEqual([]);
    expect(room.currentRun()).toBeNull();
    expect(room.epoch()).toBe(epoch + 1);
    expect(room.cancelRequested(begun.run.id)).toBe(true);
    expect(room.finishRun(begun.run.id, { status: 'complete', synthesis: 'late' })).toBe(false);
    expect(room.currentRun()).toBeNull();
  });
});
