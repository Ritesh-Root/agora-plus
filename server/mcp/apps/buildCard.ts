import { existsSync } from 'fs';
import { createRequire } from 'module';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

function sourceDir(): string {
  const beside = dirname(fileURLToPath(import.meta.url));
  if (existsSync(join(beside, 'householdCard.html'))) return beside;
  return join(process.cwd(), 'server', 'mcp', 'apps');
}

/** Bundles the view into one HTML file. Writes it next to the source and, when present, into dist/. */
export async function buildHouseholdCard(): Promise<string> {
  const dir = sourceDir();
  const esbuild = await import('esbuild');
  const built = await esbuild.build({
    absWorkingDir: dir,
    entryPoints: [join(dir, 'householdCard.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    // The prebuilt browser file already includes the client. Bundling the
    // typed entry again pulls in every Zod locale.
    alias: {
      '@modelcontextprotocol/ext-apps': require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'),
    },
  });
  const file = built.outputFiles[0];
  if (!file) throw new Error('The household card bundle was empty.');
  const js = file.text.replace(/<\/script/gi, '<\\/script');
  const template = await readFile(join(dir, 'householdCard.html'), 'utf8');
  const marker = '<!--AGORA_CARD_SCRIPT-->';
  if (!template.includes(marker)) throw new Error('The household card template has no script marker.');
  const html = template.replace(marker, () => `<script>${js}</script>`);
  const outDir = join(dir, 'dist');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'household-card.html'), html);
  const prodDir = join(process.cwd(), 'dist');
  if (existsSync(prodDir)) await writeFile(join(prodDir, 'household-card.html'), html);
  return html;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  buildHouseholdCard().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The household card could not be built.';
    console.error(message);
    process.exitCode = 1;
  });
}
