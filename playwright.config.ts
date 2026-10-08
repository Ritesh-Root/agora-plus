import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices, type Project, webkit } from '@playwright/test';

/**
 * Linux WebKit ships as an ELF that needs host ICU, JPEG, and related libs.
 * When ldd reports those missing, omit the project so the other browsers still run.
 * Any other layout (macOS, a browser we could not inspect) keeps the WebKit project.
 */
function includeWebkit(): boolean {
  let script: string;
  try {
    script = webkit.executablePath();
  } catch {
    return true;
  }
  const root = path.dirname(script);
  const bin = path.join(root, 'minibrowser-wpe', 'bin', 'MiniBrowser');
  const lib = path.join(root, 'minibrowser-wpe', 'lib');
  if (!existsSync(bin)) return true;
  try {
    const out = execFileSync('ldd', [bin], {
      encoding: 'utf8',
      env: { ...process.env, LD_LIBRARY_PATH: lib },
    });
    return !out.includes('=> not found');
  } catch {
    return true;
  }
}

const projects: Project[] = [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: { args: ['--disable-webgpu'] },
    },
  },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
];

if (includeWebkit()) {
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } });
} else {
  console.warn('playwright: skipping webkit; host libraries for MiniBrowser are missing');
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects,
});
