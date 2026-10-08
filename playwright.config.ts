import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices, type Project, webkit } from '@playwright/test';

const e2eDataDir = mkdtempSync(path.join(tmpdir(), 'agora-e2e-'));
const e2eDevToken = 'dev-token-0123456789abcdef0123456789ab';

function e2eEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' };
  env.AGORA_DATA_DIR = e2eDataDir;
  env.AGORA_MCP_TOKEN = e2eDevToken;
  delete env.AGORA_PUBLIC_URL;
  delete env.AGORA_HOUSEHOLD_PASSCODE;
  delete env.AGORA_SERVER_LLM;
  delete env.AGORA_ALLOW_DEV_TOKEN;
  delete env.AWS_ACCESS_KEY_ID;
  delete env.AWS_SECRET_ACCESS_KEY;
  delete env.AWS_SESSION_TOKEN;
  delete env.AWS_PROFILE;
  delete env.BEDROCK_MODEL;
  delete env.FIRECRAWL_API_KEY;
  delete env.EXA_API_KEY;
  env.AGORA_TTS = '0';
  env.AWS_EC2_METADATA_DISABLED = '1';
  return env;
}

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
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv(),
  },
  projects,
});
