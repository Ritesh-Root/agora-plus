import { expect, test, type Page } from '@playwright/test';
import { COUNCIL_RESULT, TASTE_MEMBERS } from '../src/home/tasteFixture';

/** Set TASTE_SHOTS to a directory to save screenshots of the card and the result. */
const SHOTS = process.env.TASTE_SHOTS;

async function mockTaste(page: Page, council: (body: unknown) => { status: number; json: unknown }) {
  const posted: unknown[] = [];
  await page.route('**/api/taste', (route) => route.fulfill({ json: { members: TASTE_MEMBERS, qlooReady: true, recent: [] } }));
  await page.route('**/api/taste/council', async (route) => {
    const body = route.request().postDataJSON() as unknown;
    posted.push(body);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const answer = council(body);
    await route.fulfill({ status: answer.status, json: answer.json });
  });
  return posted;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the taste council picks for everyone and shows why', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const posted = await mockTaste(page, () => ({ status: 200, json: COUNCIL_RESULT }));

  await page.goto('/');
  const card = page.getByTestId('taste-card');
  await expect(card.getByRole('heading', { name: 'Taste Council' })).toBeVisible();
  await expect(card.getByText('Powered by Qloo')).toBeVisible();
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/taste-card-desktop.png` });

  // Location only shows for places.
  await expect(card.getByLabel(/Where/)).toHaveCount(0);
  await card.getByText('Dinner out').click();
  await expect(card.getByRole('radio', { name: 'Dinner out' })).toBeChecked();
  await card.getByLabel(/Where/).fill('Indiranagar');
  await card.getByText('Family movie night').click();
  await expect(card.getByLabel(/Where/)).toHaveCount(0);

  // Dadi sits out, then comes back in.
  const dadi = card.getByRole('button', { name: /^Dadi/ });
  await dadi.click();
  await expect(dadi).toHaveAttribute('aria-pressed', 'false');
  await dadi.click();
  await expect(dadi).toHaveAttribute('aria-pressed', 'true');

  await card.getByRole('button', { name: 'Ask the council' }).click();
  await expect(card.getByText('Asking Qloo about Mia…').first()).toBeVisible();
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/taste-card-pending.png` });
  expect(posted).toEqual([{ occasion: 'movie_night' }]);

  const sheet = page.getByTestId('taste-sheet');
  await expect(sheet.getByRole('heading', { name: 'Coco' })).toBeVisible();
  await expect(sheet.getByText('Lowest fit: Dadi #3 of 12')).toBeVisible();
  await expect(sheet.getByText('because they love Encanto and Moana')).toBeVisible();
  await expect(sheet.getByText('Keeper removed')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/taste-result-top-desktop.png` });
  await sheet.getByText('Qloo calls').click();
  await expect(sheet.getByText('qloo_rank')).toBeVisible();
  if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/taste-result-calls-desktop.png` });

  await sheet.getByRole('button', { name: 'Add “Movie night: Coco” to to-do' }).click();
  await expect(sheet.getByText('Added “Movie night: Coco” to the to-do list')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(card.getByRole('button', { name: /^Coco Family movie night/ })).toBeVisible();
  await expect(page.getByText('Movie night: Coco', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed council says so, and the card fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockTaste(page, () => ({ status: 502, json: { ...COUNCIL_RESULT, picks: [], vetoes: [], status: 'error', note: 'Qloo is unreachable right now.' } }));
  await page.goto('/');
  const card = page.getByTestId('taste-card');
  await expect(card.getByRole('heading', { name: 'Taste Council' })).toBeVisible();
  await noHorizontalScroll(page);
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/taste-card-phone.png` });

  await card.getByRole('button', { name: 'Ask the council' }).click();
  await expect(card.getByRole('alert')).toContainText('Qloo is unreachable right now.');
  await card.getByRole('button', { name: 'See Qloo calls' }).click();
  const sheet = page.getByTestId('taste-sheet');
  await expect(sheet.getByText('Qloo could not answer.')).toBeVisible();
  await page.keyboard.press('Escape');

  // A good result on a phone.
  await page.unroute('**/api/taste/council');
  await page.route('**/api/taste/council', (route) => route.fulfill({ json: COUNCIL_RESULT }));
  await card.getByRole('button', { name: 'Ask the council' }).click();
  await expect(sheet.getByRole('heading', { name: 'Coco' })).toBeVisible();
  await noHorizontalScroll(page);
  const box = await sheet.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/taste-result-phone.png` });
});
