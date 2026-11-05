import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processXml } from '../src/formatters/xml/engine.ts';

test('XML 1.0 character-reference boundaries remain valid and retain their spelling', () => {
  for (const code of [9, 10, 13, 0x20, 0xd7ff, 0xe000, 0xfffd, 0x10000, 0x10ffff]) {
    for (const token of ['&#000' + code + ';', '&#x' + code.toString(16).toUpperCase() + ';']) {
      for (const source of ['<r a="' + token + '"/>', '<r>' + token + '</r>']) {
        for (const indent of ['2', '4', 'tab']) {
          assert.deepEqual(processXml(source, 'format', { indent }), { ok: true, text: source }, source);
          assert.deepEqual(processXml(source, 'validate', { indent }), { ok: true, text: '' }, source);
        }
      }
    }
  }
});

test('forbidden characters and references fail at their original location in both contexts', () => {
  for (const code of [0, 8, 11, 12, 14, 0x1f, 0xd800, 0xdfff, 0xfffe, 0xffff, 0x110000]) {
    const tokens = ['&#' + code + ';', '&#x' + code.toString(16) + ';'];
    if (code <= 0x10ffff) tokens.push(String.fromCodePoint(code));
    for (const token of tokens) {
      for (const source of ['<r a="' + token + '"/>', '<r>' + token + '</r>']) {
        for (const action of ['format', 'validate']) {
          const result = processXml(source, action, { indent: '2' });
          assert.equal(result.ok, false, JSON.stringify(source));
          assert.equal(result.error.offset, source.indexOf(token));
          assert.equal(result.error.line, 1);
          assert.equal(result.error.column, source.indexOf(token) + 1);
          assert.ok(result.error.message.length > 0);
        }
      }
    }
  }
});

test('escaped reference-looking and declaration-looking text is preserved without recursive expansion', () => {
  const source = '<r a="&amp;undefined;">&amp;#0; &amp;unknown; &lt;!DOCTYPE r&gt;</r>';
  assert.deepEqual(processXml(source, 'format', { indent: '2' }), { ok: true, text: source });
  assert.deepEqual(processXml(source, 'validate', { indent: '2' }), { ok: true, text: '' });
});
