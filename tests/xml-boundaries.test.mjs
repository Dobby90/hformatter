import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processXml } from '../src/formatters/xml/engine.ts';
import { readXmlFile } from '../src/formatters/xml/files.ts';
import { MAX_INPUT_BYTES } from '../src/services/files.ts';

const run = (source, action = 'format') => processXml(source, action, { indent: '2' });

test('resolved xml:space values protect the original spelling and inherited whitespace', () => {
  const protectedNode = "<a xml:space='prese&#114;ve'> \r\n\t<b><c/></b>\r\n </a>";
  const source = '<r>' + protectedNode + '<x/></r>';
  const expected = '<r>\n  ' + protectedNode + '\n  <x/>\n</r>';
  assert.deepEqual(run(source), { ok: true, text: expected });
  assert.deepEqual(run(expected), { ok: true, text: expected });
  for (const body of ['<![CDATA[]]><b/>', '&#x20;<b/>', '&amp;<b/>', ' \t<!--c--><?p x?>\r\n']) {
    const original = '<r>' + body + '</r>';
    assert.deepEqual(run(original), { ok: true, text: original });
  }
});

test('namespace comparison resolves references without rewriting declarations or attributes', () => {
  const source = '<r xmlns:p="urn:&#x61;" xmlns:q="urn:a"><p:a q:x="1"/><b xmlns:p="urn:b" p:x="2"/><p:c/></r>';
  const expected = '<r xmlns:p="urn:&#x61;" xmlns:q="urn:a">\n  <p:a q:x="1"/>\n  <b xmlns:p="urn:b" p:x="2"/>\n  <p:c/>\n</r>';
  assert.deepEqual(run(source), { ok: true, text: expected });
  const duplicate = '<r xmlns:p="urn:&#x61;" xmlns:q="urn:a" p:x="1" q:x="2"/>';
  for (const action of ['format', 'validate']) {
    const result = run(duplicate, action);
    assert.equal(result.ok, false);
    assert.match(result.error.message, /중복/);
    assert.equal(result.error.offset, duplicate.indexOf('q:x='));
  }
});

for (const [source, token, line, column] of [
  ['\uFEFF<r>한😀</bad>', '</bad>', 1, 8],
  ['<r>\r\n  <a>😀한</wrong>\r\n</r>', '</wrong>', 2, 9],
  ['<r>\r  한😀&#0;</r>', '&#0;', 2, 6],
  ['<r>\n<a key="한😀&missing;"/></r>', '&missing;', 2, 12],
]) {
  test('both actions report the original position: ' + JSON.stringify(source), () => {
    for (const action of ['format', 'validate']) {
      const result = run(source, action);
      assert.equal(result.ok, false);
      assert.deepEqual(
        { offset: result.error.offset, line: result.error.line, column: result.error.column },
        { offset: source.indexOf(token), line, column },
      );
      assert.ok(result.error.message.length > 0);
    }
  });
}

test('external, parameter and standalone entity declarations are unsupported for both actions', () => {
  for (const source of [
    '<!DOCTYPE r PUBLIC "-//EXAMPLE//DTD TEST//EN" "https://example.invalid/r.dtd"><r/>',
    '<!DOCTYPE r [<!ENTITY % remote SYSTEM "https://example.invalid/r.dtd">%remote;]><r/>',
    '<!DOCTYPE r [<!ENTITY remote SYSTEM "file:///unavailable">]><r>&remote;</r>',
    '<!ENTITY remote SYSTEM "https://example.invalid/entity"><r/>',
    '<?xml version="1.1"?><r/>',
  ]) {
    for (const action of ['format', 'validate']) {
      const result = run(source, action);
      assert.equal(result.ok, false, source);
      assert.equal(result.kind, 'unsupported', source);
      assert.match(result.error.message, /DOCTYPE|DTD|엔티티|1\.0/);
      assert.equal(result.error.offset, 0);
    }
  }
});

test('the output boundary counts UTF-8 bytes and accepts exactly 40 MiB', () => {
  const depth = 4500;
  const limit = 40 * 1024 * 1024;
  // Nested <a> tags plus a <b> leaf: raw tags, newlines, and two-space indentation.
  const structuralBytes = 7 * depth + 7 + 2 * depth + 2 * depth * depth;
  const fillerBytes = limit - structuralBytes;
  const content = '한'.repeat(Math.floor(fillerBytes / 3)) + 'x'.repeat(fillerBytes % 3);
  const document = extra => '<a>'.repeat(depth) + '<b>' + content + extra + '</b>' + '</a>'.repeat(depth);
  assert.ok(Buffer.byteLength(document('x')) < MAX_INPUT_BYTES);
  const accepted = run(document(''));
  assert.equal(accepted.ok, true, accepted.ok ? '' : accepted.error.message);
  assert.equal(Buffer.byteLength(accepted.text), limit);
  const rejected = run(document('x'));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.kind, 'error');
  assert.match(rejected.error.message, /40 MiB/);
  assert.deepEqual(run(document('x'), 'validate'), { ok: true, text: '' });
  assert.deepEqual(run('<recovered/>'), { ok: true, text: '<recovered/>' });
});

test('XML import measures multibyte UTF-8 input at the exact file boundary', async () => {
  const source = '한'.repeat(Math.floor(MAX_INPUT_BYTES / 3)) + 'x'.repeat(MAX_INPUT_BYTES % 3);
  const exact = new File([source], 'boundary.TXT');
  assert.equal(exact.size, MAX_INPUT_BYTES);
  assert.equal(await readXmlFile(exact), source);
  await assert.rejects(readXmlFile(new File([source, 'x'], 'boundary.xml')), /10 MiB/);
});

test('rejected extension and size never start a file read', async () => {
  for (const [name, size, reason] of [
    ['wrong.csv', 4, /xml/],
    ['large.xml', MAX_INPUT_BYTES + 1, /10 MiB/],
  ]) {
    let reads = 0;
    await assert.rejects(readXmlFile({
      name, size,
      arrayBuffer: async () => { reads++; return new ArrayBuffer(0); },
    }), reason);
    assert.equal(reads, 0);
  }
});
