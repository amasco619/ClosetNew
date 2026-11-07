import type { Express, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { COMPLIANCE_DOCUMENT_META } from '../constants/complianceDocumentMeta';

const DOCUMENTS = {
  'privacy-policy': { title: 'Privacy Policy', file: 'privacy-policy-page.md' },
  'terms-of-service': { title: 'Terms of Service', file: 'terms-of-service-page.md' },
} as const;

type DocumentSlug = keyof typeof DOCUMENTS;

function getDocument(slug: DocumentSlug) {
  const metadata = DOCUMENTS[slug];
  const sourcePath = path.resolve(process.cwd(), 'docs/compliance', metadata.file);
  const content = fs.readFileSync(sourcePath, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
  return { title: metadata.title, content, ...COMPLIANCE_DOCUMENT_META };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function renderMarkdown(content: string): string {
  const html: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) html.push(`<ul>${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^-\s+(.+)$/.exec(line);
    if (!line.trim()) {
      flushList();
    } else if (heading) {
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    } else if (bullet) {
      list.push(bullet[1]);
    } else {
      flushList();
      html.push(`<p>${escapeHtml(line.trim())}</p>`);
    }
  }
  flushList();
  return html.join('\n');
}

function pageHtml(slug: DocumentSlug): string {
  const document = getDocument(slug);
  const otherSlug = slug === 'privacy-policy' ? 'terms-of-service' : 'privacy-policy';
  const otherTitle = DOCUMENTS[otherSlug].title;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(document.title)} — Amodka</title>
<meta name="description" content="${escapeHtml(document.title)} draft product information for Amodka.">
<style>
body{margin:0;background:#f5f3f0;color:#101522;font:16px/1.65 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 22px 64px}
aside{padding:12px 16px;border:1px solid #c9b68e;border-radius:12px;background:#fbf7ef;font-weight:650}
.meta{color:#626a73;font-size:13px;margin:12px 0}
article{background:#fff;border:1px solid #e5e1da;border-radius:18px;padding:26px;margin-top:22px}
h1{font:500 32px/1.2 Georgia,serif}h2{font-size:20px;margin-top:26px}
p,li{overflow-wrap:anywhere}nav{margin-top:24px;color:#626a73}a{color:#101522}
</style>
</head>
<body><main>
<aside>DRAFT: for legal review</aside>
<div class="meta">Version ${escapeHtml(document.version)} · Effective date: ${escapeHtml(document.effectiveDate)}<br>Change log: ${escapeHtml(document.changeLog)}</div>
<article>${renderMarkdown(document.content)}</article>
<nav><a href="/${otherSlug}">${escapeHtml(otherTitle)}</a></nav>
</main></body></html>`;
}

function setPublicPageHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function registerLegalPages(app: Express): void {
  for (const slug of Object.keys(DOCUMENTS) as DocumentSlug[]) {
    const pagePath = `/${slug}`;
    const dataPath = `/legal/${slug}`;
    app.get(pagePath, (_req: Request, res: Response) => {
      try {
        setPublicPageHeaders(res);
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline';");
        res.type('html').send(pageHtml(slug));
      } catch {
        res.status(503).type('text').send('This document is temporarily unavailable.');
      }
    });
    app.get(dataPath, (_req: Request, res: Response) => {
      try {
        setPublicPageHeaders(res);
        res.json(getDocument(slug));
      } catch {
        res.status(503).json({ error: 'document_unavailable' });
      }
    });
  }
}
