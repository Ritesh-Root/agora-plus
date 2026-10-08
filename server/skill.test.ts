import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  expect(normalized.startsWith('---\n')).toBe(true);
  const end = normalized.indexOf('\n---\n', 4);
  expect(end).toBeGreaterThan(4);
  const data: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    expect(colon).toBeGreaterThan(0);
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: normalized.slice(end + '\n---\n'.length) };
}

function bodyLines(body: string): number {
  const lines = body.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('Agent Skills', () => {
  const skillsDir = path.join(root, 'skills');
  const folders = readdirSync(skillsDir).filter((name) => statSync(path.join(skillsDir, name)).isDirectory());

  it('finds at least the household skill', () => {
    expect(folders).toContain('agora-household');
  });

  for (const folder of folders) {
    const file = path.join(skillsDir, folder, 'SKILL.md');
    it(`${folder} frontmatter matches the skill folder`, () => {
      const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));
      expect(data.name).toBe(folder);
      expect(data.name.length).toBeGreaterThan(0);
      expect(data.name.length).toBeLessThanOrEqual(64);
      expect(data.name).toMatch(NAME);
      expect(data.description.trim().length).toBeGreaterThan(0);
      expect(data.description.length).toBeLessThanOrEqual(1024);
      if (data.compatibility) expect(data.compatibility.length).toBeLessThanOrEqual(500);
      expect(bodyLines(body)).toBeLessThan(500);
    });
  }
});

describe('alexa-addon/addon.json', () => {
  const addon = JSON.parse(readFileSync(path.join(root, 'alexa-addon/addon.json'), 'utf8')) as {
    manifestVersion: string;
    storeListing: {
      distributionCountries: string[];
      locales: {
        'en-US': {
          name: { value: string };
          shortDescription: string;
          fullDescription: string;
          examplePhrases: string[];
          privacyAndCompliance: { privacyPolicyUrl: string; termsOfUseUrl: string };
          mediaAssets: {
            icons: { light: { size: string; uri: string }[] };
            carouselImages: { uri: string; altText: string; size: string }[];
          };
        };
      };
    };
    integrations: { type: string; config: { endpoints: { default: { type: string; uri: string } } } }[];
  };

  const locale = addon.storeListing.locales['en-US'];

  it('meets the quickstart length limits', () => {
    expect(addon.manifestVersion).toBe('1.0');
    expect(addon.storeListing.distributionCountries).toEqual(['US']);
    expect(locale.name.value).toBe('AGORA+ Household');
    expect(locale.name.value.length).toBeLessThanOrEqual(30);
    expect(locale.shortDescription.length).toBeGreaterThan(0);
    expect(locale.shortDescription.length).toBeLessThanOrEqual(123);
    expect(locale.fullDescription.length).toBeGreaterThan(0);
    expect(locale.fullDescription.length).toBeLessThanOrEqual(4000);
    expect(locale.examplePhrases.length).toBeGreaterThanOrEqual(3);
    expect(locale.examplePhrases.length).toBeLessThanOrEqual(4);
    for (const phrase of locale.examplePhrases) {
      expect(phrase.length).toBeGreaterThan(0);
      expect(phrase.length).toBeLessThanOrEqual(200);
    }
    expect(locale.privacyAndCompliance.privacyPolicyUrl).toBe('https://<host>/privacy.html');
    expect(locale.privacyAndCompliance.termsOfUseUrl).toBe('https://<host>/terms.html');
    expect(addon.integrations[0]?.type).toBe('MCP');
    expect(addon.integrations[0]?.config.endpoints.default).toEqual({
      type: 'HTTPS',
      uri: 'https://<host>/mcp',
    });
  });

  it('lists the six icons and the carousel, and the PNG files match', () => {
    const expected = [72, 64, 88, 126, 180, 241];
    expect(locale.mediaAssets.icons.light.map((icon) => icon.size)).toEqual(expected.map((size) => `${size}x${size}`));
    for (const size of expected) {
      const uri = `https://<host>/media/icon-${size}.png`;
      expect(locale.mediaAssets.icons.light.find((icon) => icon.size === `${size}x${size}`)?.uri).toBe(uri);
      const packaged = readFileSync(path.join(root, 'alexa-addon/media', `icon-${size}.png`));
      const served = readFileSync(path.join(root, 'public/media', `icon-${size}.png`));
      expect(pngSize(packaged)).toEqual({ width: size, height: size });
      expect(served.equals(packaged)).toBe(true);
    }
    const carousel = locale.mediaAssets.carouselImages[0];
    expect(carousel?.size).toBe('600x900');
    expect(carousel?.uri).toBe('https://<host>/media/carousel-600x900.png');
    expect(carousel?.altText.length).toBeGreaterThan(0);
    expect(carousel?.altText.length).toBeLessThanOrEqual(250);
    const image = readFileSync(path.join(root, 'alexa-addon/media/carousel-600x900.png'));
    expect(pngSize(image)).toEqual({ width: 600, height: 900 });
    expect(readFileSync(path.join(root, 'public/media/carousel-600x900.png')).equals(image)).toBe(true);
  });
});
