import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import YAML from 'yaml';
import { loadClient, validateClient, buildSeed, siteFallback, build } from '../skills/thai-sme-booking/scripts/build-config.mjs';
import { loadGas } from './gas-harness.mjs';

const EXAMPLE = 'skills/thai-sme-booking/templates/client.example.yaml';

test('example and demo client.yaml validate', () => {
  assert.deepEqual(validateClient(loadClient(EXAMPLE)), []);
  const demo = loadClient('demo/salon/client.yaml');
  assert.deepEqual(validateClient(demo), []);
  assert.equal(demo.deploy.demo_mode, true);
});

test('validateClient catches the usual intake mistakes', () => {
  const c = loadClient(EXAMPLE);
  c.slug = 'Baan Suay';
  c.payment.promptpay_id = '123';
  c.services.push({ ...c.services[0] });
  c.hours.tue = '10-20';
  const errors = validateClient(c).join('\n');
  assert.match(errors, /slug/);
  assert.match(errors, /promptpay_id/);
  assert.match(errors, /duplicate service id/);
  assert.match(errors, /hours.tue/);
});

test('template Seed.js is up to date with client.example.yaml', () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync('skills/thai-sme-booking/templates/apps-script/Seed.js', 'utf8'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.SEED)), buildSeed(loadClient(EXAMPLE)),
    'run: npm run regen');
});

test('siteFallback matches what Apps Script serves after setup', () => {
  const h = loadGas({ props: { SHARED_SECRET: 's' } });
  h.g.setup();
  const live = h.post({ kind: 'site', secret: 's' }).site;
  const fallback = siteFallback(loadClient(EXAMPLE));
  delete live.generatedAt;
  delete fallback.generatedAt;
  assert.deepEqual(fallback, live);
});

test('template site.json is up to date with client.example.yaml', () => {
  const json = JSON.parse(fs.readFileSync('skills/thai-sme-booking/templates/site/src/data/site.json', 'utf8'));
  assert.deepEqual(json, siteFallback(loadClient(EXAMPLE)));
});

test('build() writes a complete, client-specific build folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsbk-'));
  const clientFile = path.join(dir, 'client.yaml');
  const c = YAML.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  c.slug = 'test-shop';
  c.deploy.gas_url = 'https://script.google.com/macros/s/ABC/exec';
  c.deploy.site_url = 'https://test-shop.pages.dev/';
  fs.writeFileSync(clientFile, YAML.stringify(c));

  const { out } = build(clientFile);
  const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');
  for (const f of ['apps-script/Code.js', 'apps-script/Lib.js', 'apps-script/Seed.js', 'apps-script/appsscript.json',
    'worker/index.js', 'site/astro.config.mjs', 'site/src/pages/liff/book.astro', 'NEXT-STEPS.md']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
  assert.match(read('worker/wrangler.toml'), /^name = "test-shop-api"$/m);
  assert.match(read('worker/wrangler.toml'), /^GAS_URL = "https:\/\/script.google.com\/macros\/s\/ABC\/exec"$/m);
  assert.match(read('worker/wrangler.toml'), /^ALLOWED_ORIGINS = "https:\/\/test-shop.pages.dev"$/m);
  assert.match(read('site/.env'), /^SITE_URL=https:\/\/test-shop.pages.dev$/m);
  assert.ok(!fs.existsSync(path.join(out, 'site', 'node_modules')));
  fs.rmSync(dir, { recursive: true, force: true });
});
