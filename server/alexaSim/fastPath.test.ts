import { afterEach, describe, expect, it, vi } from 'vitest';
import { fastPathEnabled, routeFast } from './fastPath';

const none = {};

const savedZone = process.env.AGORA_TIMEZONE;

afterEach(() => {
  delete process.env.ALEXA_SIM_FAST_PATH;
  vi.useRealTimers();
  if (savedZone === undefined) delete process.env.AGORA_TIMEZONE;
  else process.env.AGORA_TIMEZONE = savedZone;
});

describe('routeFast', () => {
  it('remembers a fact and keeps its casing', () => {
    expect(routeFast('Remember Mia is Allergic to Peanuts!', none)).toEqual({
      tool: 'remember',
      args: { fact: 'Mia is Allergic to Peanuts' },
    });
    expect(routeFast('note that the MILK is low', none)).toEqual({
      tool: 'remember',
      args: { fact: 'the MILK is low' },
    });
    expect(routeFast("don't forget the keys", none)).toEqual({
      tool: 'remember',
      args: { fact: 'the keys' },
    });
    expect(routeFast('Don’t forget that Mia likes tea.', none)).toEqual({
      tool: 'remember',
      args: { fact: 'Mia likes tea' },
    });
    expect(routeFast('remember', none)).toBeNull();
  });

  it('routes the morning briefing phrases', () => {
    for (const utterance of ["what's my briefing", 'brief me', "What's on today?", 'Good morning!']) {
      expect(routeFast(utterance, none)).toEqual({ tool: 'daily_briefing', args: {} });
    }
  });

  it('adds, lists, and completes tasks', () => {
    expect(routeFast('add Buy oat milk to my list', none)).toEqual({
      tool: 'add_task',
      args: { title: 'Buy oat milk' },
    });
    expect(routeFast('Add call Mom to my tasks', none)).toEqual({
      tool: 'add_task',
      args: { title: 'call Mom' },
    });
    expect(routeFast('add bins to my to-do', none)).toEqual({
      tool: 'add_task',
      args: { title: 'bins' },
    });
    expect(routeFast('Remind me to Call the dentist', none)).toEqual({
      tool: 'add_task',
      args: { title: 'Call the dentist' },
    });
    expect(routeFast("what's on my list", none)).toEqual({ tool: 'list_tasks', args: {} });
    expect(routeFast('What are my tasks?', none)).toEqual({ tool: 'list_tasks', args: {} });
    expect(routeFast('list my tasks', none)).toEqual({ tool: 'list_tasks', args: {} });
    expect(routeFast('mark The Laundry done', none)).toEqual({
      tool: 'complete_task',
      args: { taskIdOrTitle: 'The Laundry' },
    });
    expect(routeFast('I finished the Report', none)).toEqual({
      tool: 'complete_task',
      args: { taskIdOrTitle: 'the Report' },
    });
    expect(routeFast('Milk is done.', none)).toEqual({
      tool: 'complete_task',
      args: { taskIdOrTitle: 'Milk' },
    });
    expect(routeFast('add milk to my shopping list', none)).toEqual({
      tool: 'add_task',
      args: { title: 'milk', list: 'shopping' },
    });
    expect(routeFast('add milk to the shopping list', none)).toEqual({
      tool: 'add_task',
      args: { title: 'milk', list: 'shopping' },
    });
    expect(routeFast('put eggs on the grocery list', none)).toEqual({
      tool: 'add_task',
      args: { title: 'eggs', list: 'shopping' },
    });
    expect(routeFast("what's on my shopping list?", none)).toEqual({
      tool: 'list_tasks',
      args: { list: 'shopping' },
    });
  });

  it('answers a memory question without leaving the fast path', () => {
    expect(routeFast('what is Mia allergic to?', none)).toEqual({
      tool: 'recall',
      args: { query: 'what is Mia allergic to' },
    });
    expect(routeFast('what do you know about Mia?', none)).toEqual({
      tool: 'recall',
      args: { query: 'what do you know about Mia' },
    });
    expect(routeFast('what does Jen like?', none)).toEqual({
      tool: 'recall',
      args: { query: 'what does Jen like' },
    });
    expect(routeFast('what is the weather?', none)).toBeNull();
  });

  it('sets a reminder time in the household zone', () => {
    process.env.AGORA_TIMEZONE = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T20:00:00.000Z'));
    expect(routeFast('remind me to call Grandma at 6pm', none)).toEqual({
      tool: 'add_task',
      args: { title: 'call Grandma', due: 'at 6pm', dueAt: '2026-10-08T18:00:00-07:00' },
    });
    expect(routeFast('remind me in 10 minutes to check the oven', none)).toEqual({
      tool: 'add_task',
      args: { title: 'check the oven', due: 'in 10 minutes', dueAt: '2026-10-08T13:10:00-07:00' },
    });
  });

  it('sends a plan through with the whole utterance', () => {
    expect(routeFast('Plan dinners for this week.', none)).toEqual({
      tool: 'plan_and_run',
      args: { goal: 'Plan dinners for this week' },
    });
    expect(routeFast('organize the hall closet', none)).toEqual({
      tool: 'plan_and_run',
      args: { goal: 'organize the hall closet' },
    });
    expect(routeFast('schedule a dentist visit', none)).toEqual({
      tool: 'plan_and_run',
      args: { goal: 'schedule a dentist visit' },
    });
    expect(routeFast('Plan dinners for this week and add the groceries', none)).toEqual({
      tool: 'plan_and_run',
      args: { goal: 'Plan dinners for this week and add the groceries' },
    });
    expect(routeFast('plan', none)).toBeNull();
  });

  it('approves only while an approval is waiting', () => {
    const pending = { pendingApprovalId: 'ap-1' };
    for (const utterance of ['yes', 'Yeah!', 'yep', 'go ahead', 'do it', 'approve']) {
      expect(routeFast(utterance, pending)).toEqual({
        tool: 'approve_action',
        args: { approvalId: 'ap-1', decision: 'approve' },
      });
    }
    for (const utterance of ['no', 'nope', 'cancel', "don't"]) {
      expect(routeFast(utterance, pending)).toEqual({
        tool: 'approve_action',
        args: { approvalId: 'ap-1', decision: 'reject' },
      });
    }
    expect(routeFast('yes', none)).toBeNull();
    expect(routeFast('no', none)).toBeNull();
    expect(routeFast('go ahead', none)).toBeNull();
  });

  it('leaves compounds and open questions for the model', () => {
    expect(routeFast('remember the allergy and add milk to my list', none)).toBeNull();
    expect(routeFast('tell me a joke', none)).toBeNull();
    expect(routeFast('please remember the keys', none)).toBeNull();
    expect(routeFast('plan is done', none)).toBeNull();
  });

  it('turns off when ALEXA_SIM_FAST_PATH is 0', () => {
    expect(fastPathEnabled()).toBe(true);
    process.env.ALEXA_SIM_FAST_PATH = '0';
    expect(fastPathEnabled()).toBe(false);
    process.env.ALEXA_SIM_FAST_PATH = '1';
    expect(fastPathEnabled()).toBe(true);
  });
});
