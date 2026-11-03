import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownPreviewLimit, markdownUrl, markdownDownloadName, MAX_PREVIEW_BYTES } from '../src/services/markdown.ts';

test('Markdown links allow explicit web/mail and fragment links but never local or executable targets', () => {
  for (const url of ['https://example.org/a?q=1#part', 'http://example.org', 'mailto:a@example.org', '#한글', '#md-heading-test']) assert.equal(markdownUrl(url), url);
  for (const url of ['', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', '//example.org', './private.md', '/admin/logout', 'http://', ' https://example.org', 'https://example.org/\r\n']) assert.equal(markdownUrl(url), '');
});

test('preview budgets count UTF-8 bytes and CR/LF lines without limiting source export', () => {
  assert.equal(markdownPreviewLimit('a'.repeat(MAX_PREVIEW_BYTES)), null);
  assert.match(markdownPreviewLimit('한'.repeat(Math.ceil(MAX_PREVIEW_BYTES / 3))), /256 KiB/);
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.equal(markdownPreviewLimit('a' + (newline + 'a').repeat(3999)), null);
    assert.match(markdownPreviewLimit('a' + (newline + 'a').repeat(4000)), /4,000행/);
  }
});

test('Markdown downloads retain the document stem without claiming it was formatted', () => {
  assert.equal(markdownDownloadName('README.MARKDOWN'), 'README.md');
  assert.equal(markdownDownloadName('design.v2.txt'), 'design.v2.md');
  assert.equal(markdownDownloadName(''), 'document.md');
});
