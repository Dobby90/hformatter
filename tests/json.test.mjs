import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processJson } from '../src/formatters/json/engine.ts';

const run = (text, action = 'format', indent = '2') => processJson(text, action, { indent });
function success(text, action, indent) { const result = run(text, action, indent); assert.equal(result.ok, true, JSON.stringify(result)); return result.text; }
test('objects, arrays and primitive values follow JSON grammar', () => {
  for (const text of ['{}','[]','[1, true, false, null, "한글", {"a": []}]','"hello"','-2.50e+10','true','false','null','0']) {
    const formatted = success(text);
    assert.deepEqual(JSON.parse(formatted), JSON.parse(text));
    assert.equal(success(formatted, 'minify'), success(text, 'minify'));
    assert.equal(run(text, 'validate').ok, true);
  }
  assert.equal(success('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
});
test('preserves large numbers, duplicate keys, key order, and original escapes', () => {
  const input = '{"z":9007199254740993123456789,"a":-0,"z":1.2300E+99,"s":"\\uD55C\\uAE00 \\\" {,}: \\\\ \\n"}';
  assert.equal(success(success(input), 'minify'), input);
  assert.equal(success('"{\\"a\\":1}"'), '"{\\"a\\":1}"');
});
test('supports all indentation options and UTF-8 BOM', () => {
  assert.equal(success('\uFEFF{ "한글": 1 }', 'format', '4'), '{\n    "한글": 1\n}');
  assert.equal(success('{"a":1}', 'format', 'tab'), '{\n\t"a": 1\n}');
  assert.equal(success('{ "a" : "a , : [ ] { }" }', 'minify'), '{"a":"a , : [ ] { }"}');
  assert.throws(() => run('{}', 'format', '8'), /들여쓰기/);
});
test('rejects invalid syntax without silently repairing input', () => {
  for (const text of ['', ' ', '{"a":1,}', '[1,]', "{'a':1}", '{a:1}', '{"a" 1}', '{"a":}', '[1 2]', '01','-01','+1','1.','1e','--1','NaN','Infinity','true false','{}[]','/*x*/{}','[}', '{]', '{"a":[1}', '"x\ny"','"\\x20"','"\\u12G4"','"unfinished','\u00a0{}','{"x":undefined}']) {
    const result = run(text);
    assert.equal(result.ok, false, `unexpected success for ${JSON.stringify(text)}`);
    assert.ok(result.error.offset >= 0 && result.error.offset <= text.length);
    assert.ok(result.error.line >= 1 && result.error.column >= 1);
  }
});
test('reports original-source line and column with CRLF and BOM', () => {
  const text = '\uFEFF{\r\n  "a": 1,\r\n}';
  const result = run(text);
  assert.equal(result.ok, false);
  assert.deepEqual({ offset: result.error.offset, line: result.error.line, column: result.error.column }, { offset: text.length - 1, line: 3, column: 1 });
});
test('iterative parser handles deep nesting; pretty output has a growth limit', () => {
  const text = '['.repeat(20_000) + '0' + ']'.repeat(20_000);
  assert.equal(success(text, 'minify'), text);
  assert.equal(run(text, 'validate').ok, true);
  assert.throws(() => run(text), /40 MiB/);
});
test('near-limit single-line input is preserved', t => {
  const text = '"' + 'a'.repeat(10 * 1024 * 1024 - 2) + '"';
  const start = performance.now();
  assert.equal(success(text, 'minify'), text);
  t.diagnostic(`10 MiB single-line minify: ${(performance.now() - start).toFixed(1)} ms (Node, not editor performance)`);
});
test('valid generated documents agree with native parser semantics', () => {
  let seed = 20261015;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32;
  const make = depth => {
    const choice = Math.floor(rand() * (depth ? 7 : 5));
    if (choice === 0) return null;
    if (choice === 1) return rand() > .5;
    if (choice === 2) return (rand() - .5) * 1e15;
    if (choice === 3) return '한글 "\\\n{}[],: ' + rand();
    if (choice === 4) return '';
    if (choice === 5) return Array.from({ length: Math.floor(rand() * 5) }, () => make(depth - 1));
    return Object.fromEntries(Array.from({ length: Math.floor(rand() * 5) }, (_, i) => ['key' + i, make(depth - 1)]));
  };
  for (let i = 0; i < 300; i++) { const value = make(5); const text = JSON.stringify(value); assert.deepEqual(JSON.parse(success(text)), value); assert.equal(success(text, 'minify'), text); }
});
test('mutated token streams match strict native syntax acceptance', () => {
  let seed = 17;
  const rand = n => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % n);
  const base = '{"a":[1,true,null,"escaped\\n text"],"b":{"한글":-3.2e+4}}';
  const chars = '{}[]:,"\\012truefaln \t\n\u0000';
  for (let i = 0; i < 3000; i++) {
    const at = rand(base.length), kind = rand(3);
    const candidate = base.slice(0, at) + (kind === 0 ? '' : chars[rand(chars.length)]) + base.slice(at + (kind === 1 ? 0 : 1));
    let native = true; try { JSON.parse(candidate); } catch { native = false; }
    assert.equal(run(candidate, 'validate').ok, native, JSON.stringify(candidate));
  }
});
