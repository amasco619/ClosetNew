import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import { registerLegalPages } from '../server/legalPages';

async function main() {
  const app = express();
  registerLegalPages(app);

  for (const [slug, title] of [
    ['privacy-policy', 'Privacy Policy'],
    ['terms-of-service', 'Terms of Service'],
  ] as const) {
    const json = await request(app).get(`/legal/${slug}`);
    assert.equal(json.status, 200, `${slug} is publicly readable`);
    assert.equal(json.headers['cache-control'], 'no-store');
    assert.equal(json.headers['set-cookie'], undefined, 'public documents do not set cookies');
    assert.equal(json.body.title, title);
    assert.equal(json.body.version, '0.2');
    assert.match(json.body.effectiveDate, /draft date; not in force/);
    assert.ok(json.body.changeLog);
    assert.ok(json.body.content.length > 100);
    assert.doesNotMatch(json.body.content, /<!-- Evidence:/, 'internal source comments are not exposed');

    const html = await request(app).get(`/${slug}`);
    assert.equal(html.status, 200);
    assert.match(html.headers['content-type'], /text\/html/);
    assert.match(html.text, /DRAFT: for legal review/);
    assert.match(html.text, new RegExp(`Version ${json.body.version}`));
    assert.match(html.text, new RegExp(title));
    assert.doesNotMatch(html.text, /<script|google-analytics|facebook-pixel/i, 'page has no scripts or trackers');
    assert.equal(html.headers['set-cookie'], undefined);
  }

  const privacy = fs.readFileSync('docs/compliance/privacy-policy-page.md', 'utf8');
  const terms = fs.readFileSync('docs/compliance/terms-of-service-page.md', 'utf8');
  assert.match(privacy, /PhotoRoom/);
  assert.match(privacy, /planned model-based wardrobe-text judge is not live/);
  assert.match(privacy, /shortest sleeve you wear/);
  assert.match(privacy, /not currently sent to the planned wardrobe-text judge/);
  assert.match(terms, /recorded AI-processing permission/);
  assert.match(fs.readFileSync('docs/compliance/page-update-checklist.md', 'utf8'), /NOT YET LIVE/);

  for (const file of ['app/sign-in.tsx', 'app/(tabs)/profile.tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /<LegalLinks/);
  }
  assert.match(fs.readFileSync('app/_layout.tsx', 'utf8'), /name="privacy-policy"/);
  assert.match(fs.readFileSync('app/_layout.tsx', 'utf8'), /name="terms-of-service"/);

  console.log('Public legal draft pages, metadata, privacy headers, source mapping and app links passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
