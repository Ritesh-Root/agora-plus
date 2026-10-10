import { expect, test, type Page } from '@playwright/test';

async function finishSpeechImmediately(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const synth = {
      speak(utterance: { onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null; onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null }) {
        utterance.onstart?.call(utterance as SpeechSynthesisUtterance, new Event('start') as SpeechSynthesisEvent);
        queueMicrotask(() => utterance.onend?.call(utterance as SpeechSynthesisUtterance, new Event('end') as SpeechSynthesisEvent));
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices: () => [],
      pending: false,
      speaking: false,
      paused: false,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  });
}

function spoken(page: Page) {
  return page.getByTestId('alexa-caption').locator('p').last();
}

async function say(page: Page, utterance: string): Promise<void> {
  const box = page.getByPlaceholder('Type a request');
  await box.fill(utterance);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('the voice simulator remembers, shops, briefs, and forgets only on a plain yes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await finishSpeechImmediately(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/AGORA\+ Home/);
  await expect(page.getByText('Linked')).toBeVisible();
  await page.getByRole('button', { name: 'Under the hood' }).click();

  await say(page, 'Remember Mia is allergic to peanuts');
  await expect(page.getByText('verified ✓').first()).toBeVisible();
  await expect(spoken(page)).toContainText(/peanuts/i);

  await say(page, 'What is Mia allergic to?');
  await expect(spoken(page)).toContainText(/peanuts/i);

  await say(page, 'Add milk to my shopping list');
  await expect(page.getByText('verified ✓').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible();
  await expect(page.getByText('milk', { exact: true }).first()).toBeVisible();

  await say(page, "What's my briefing?");
  await expect(spoken(page)).toContainText(/peanuts/i);

  await say(page, 'Forget that Mia is allergic to peanuts');
  const approval = page.getByTestId('alexa-approval');
  await expect(approval).toBeVisible();
  await expect(approval.getByRole('button', { name: 'Approve' })).toBeFocused();

  await say(page, 'yes but not Tuesday');
  await expect(spoken(page)).toContainText('plain yes or no');
  await expect(approval).toBeVisible();
  await expect(page.getByText('verified ✓').filter({ hasText: 'verified' })).toHaveCount(2);

  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(approval).toBeHidden();
  await expect(page.getByText('verified ✓')).toHaveCount(3);

  await say(page, 'What is Mia allergic to?');
  await expect(spoken(page)).toContainText(/don.?t know/i);
  await expect(spoken(page)).not.toContainText(/peanuts/i);

  const office = await page.context().newPage();
  const officeErrors: string[] = [];
  office.on('pageerror', (error) => officeErrors.push(error.message));
  await office.goto('/office?renderer=webgl');
  await expect(
    office.getByTestId('office-canvas').or(office.getByTestId('join-name-input')).first(),
  ).toBeVisible();
  expect(officeErrors, officeErrors.join('\n')).toEqual([]);
  await office.close();

  expect(errors, errors.join('\n')).toEqual([]);
});
