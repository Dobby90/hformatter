import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readXmlFile } from '../src/formatters/xml/files.ts';
import { downloadName, MAX_INPUT_BYTES } from '../src/services/files.ts';

test('XML and txt import strips UTF-8 BOM, accepts upper-case extensions and retains invalid syntax', async () => {
  for (const name of ['example.xml', 'example.XML', 'example.txt', 'example.TXT']) {
    assert.equal(await readXmlFile(new File(['\uFEFF<unfinished'], name)), '<unfinished');
  }
  assert.equal(await readXmlFile(new File([], 'empty.xml')), '');
  assert.equal(await readXmlFile(new File(['<?xml version="1.0" encoding="utf-8"?><r/>'], 'a.xml')), '<?xml version="1.0" encoding="utf-8"?><r/>');
});
test('rejects encoding signatures, bad UTF-8 and unsupported declared encoding', async () => {
  for (const bytes of [[0xff,0xfe,0x3c,0], [0xfe,0xff,0,0x3c], [0,0,0xfe,0xff], [0xff,0xfe,0,0], [0x3c,0,0x3f,0], [0,0x3c,0,0x3f], [0,0,0,0x3c], [0x3c,0,0,0], [0xc3,0x28]]) {
    await assert.rejects(readXmlFile(new File([new Uint8Array(bytes)], 'a.txt')), /UTF-8/);
  }
  for (const encoding of ['UTF-16', 'UTF-32', 'ISO-8859-1']) {
    await assert.rejects(readXmlFile(new File(['<?xml version="1.0" encoding="' + encoding + '"?><r/>'], 'a.xml')), /UTF-8/);
  }
});
test('file limits, extension rejection and read errors are enforced before replacement', async () => {
  assert.equal((await readXmlFile(new File(['a'.repeat(MAX_INPUT_BYTES)], 'limit.xml'))).length, MAX_INPUT_BYTES);
  await assert.rejects(readXmlFile(new File([new Uint8Array(MAX_INPUT_BYTES + 1)], 'large.xml')), /10 MiB/);
  await assert.rejects(readXmlFile(new File(['<r/>'], 'wrong.json')), /xml/);
  await assert.rejects(readXmlFile({ name: 'bad.xml', size: 4, arrayBuffer: async () => { throw Error('read'); } }), /파일을 읽을 수 없습니다/);
});
test('XML download names follow the shared original-stem policy', () => {
  assert.equal(downloadName('', 'xml'), 'formatted.xml');
  assert.equal(downloadName('sample.data.txt', 'xml'), 'sample.data.formatted.xml');
});
