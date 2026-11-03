import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertInputSize, byteLength, readFile, downloadName, MAX_INPUT_BYTES } from '../src/services/files.ts';
test('file import accepts JSON/txt regardless of MIME, strips BOM, retains invalid JSON', async () => {
  for (const name of ['example.json', 'example.TXT']) {
    assert.equal(await readFile(new File(['\uFEFF{invalid'], name, { type: 'application/octet-stream' }), ['json', 'txt']), '{invalid');
  }
  assert.equal(await readFile(new File([], 'empty.json'), ['json', 'txt']), '');
});
test('rejects wrong extension, invalid UTF-8 and oversized files', async () => {
  await assert.rejects(readFile(new File(['{}'], 'a.csv'), ['json', 'txt']), /json/);
  await assert.rejects(readFile(new File([new Uint8Array([0xc3, 0x28])], 'a.json'), ['json']), /UTF-8/);
  await assert.rejects(readFile(new File([new Uint8Array(MAX_INPUT_BYTES + 1)], 'a.json'), ['json']), /10 MiB/);
});
test('pasted and typed text have the same UTF-8 byte limit as files', () => {
  assert.equal(byteLength('한'), 3);
  assert.doesNotThrow(() => assertInputSize('a'.repeat(MAX_INPUT_BYTES)));
  assert.throws(() => assertInputSize('a'.repeat(MAX_INPUT_BYTES + 1)), /10 MiB/);
  assert.throws(() => assertInputSize('한'.repeat(Math.ceil(MAX_INPUT_BYTES / 3))), /10 MiB/);
});
test('download names retain original stem', () => {
  assert.equal(downloadName('sample.json'), 'sample.formatted.json');
  assert.equal(downloadName('sample.data.txt'), 'sample.data.formatted.json');
  assert.equal(downloadName(''), 'formatted.json');
});
