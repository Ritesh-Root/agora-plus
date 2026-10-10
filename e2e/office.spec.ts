import { expect, test, type Page } from '@playwright/test';

async function varianceOf(buffer: Buffer, page: Page) {
  const url = `data:image/png;base64,${buffer.toString('base64')}`;
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 64) {
      const value = data[i] + data[i + 1] + data[i + 2];
      sum += value;
      sumSq += value * value;
      count += 1;
    }
    const mean = sum / count;
    return sumSq / count - mean * mean;
  }, url);
}

test('the office canvas is visible and the agents move', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon')) return;
    errors.push(text);
  });

  await page.goto('/office?renderer=webgl');
  const canvas = page.locator('[data-testid="office-canvas"]');
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-testid="renderer-badge"]')).toContainText(/WebGL2|WebGPU|2D/);
  await page.getByTestId('join-name-input').fill('Alex');
  await page.getByTestId('join-submit-btn').click();
  await expect(page.getByText('Join the Office')).toBeHidden({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const firstBytes = await canvas.screenshot();
  await page.waitForTimeout(900);
  const secondBytes = await canvas.screenshot();
  const variance = await varianceOf(firstBytes, page);
  const stats = await page.evaluate(() => (window as unknown as { __AGORA_OFFICE?: { backend: string; fps: number; lowQuality: boolean } }).__AGORA_OFFICE);
  console.log(`${info.project.name}: backend=${stats?.backend} fps=${stats?.fps} low=${stats?.lowQuality} variance=${variance.toFixed(1)}`);
  expect(variance).toBeGreaterThan(8);
  expect(Buffer.compare(firstBytes, secondBytes)).not.toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
