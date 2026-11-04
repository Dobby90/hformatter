import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processXml } from '../src/formatters/xml/engine.ts';
const run = (text, action = 'format', indent = '2') => processXml(text, action, { indent });
const formatted = (text, indent = '2') => { const result = run(text, 'format', indent); assert.equal(result.ok, true, JSON.stringify(result)); return result.text; };

test('all indentation choices have exact output and are idempotent', () => {
  for (const [indent, unit] of [['2', '  '], ['4', '    '], ['tab', '\t']]) {
    const expected = '<r>\n' + unit + '<a>\n' + unit.repeat(2) + '<b/>\n' + unit + '</a>\n</r>';
    assert.equal(formatted('<r><a><b/></a></r>', indent), expected);
    assert.equal(formatted(expected, indent), expected);
    assert.equal(run(expected, 'validate', indent).text, '');
  }
});
test('preserves exact declaration, names, ordered quoted attributes, references, comments, CDATA and PI', () => {
  const source = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<?style data?>\n<r xmlns="urn:r" xmlns:p="urn:p" z=\'&#65;\' a="&quot;"><!--안녕--><p:a><![CDATA[<x>&value;]]></p:a><empty /></r>';
  const expected = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<?style data?>\n<r xmlns="urn:r" xmlns:p="urn:p" z=\'&#65;\' a="&quot;">\n  <!--안녕-->\n  <p:a><![CDATA[<x>&value;]]></p:a>\n  <empty />\n</r>';
  assert.equal(formatted(source), expected);
  assert.equal(formatted(expected), expected);
  assert.equal(formatted('\uFEFF<r/>'), '\uFEFF<r/>');
});
test('text-only, mixed, CDATA, references and inherited preserve content stay byte-for-byte intact', () => {
  for (const body of ['   \r\n\t', 'a <b> x </b> c', '\n<b/> tail ', '<![CDATA[ \n ]]><b/>', '&#32;<b/>']) {
    const text = '<r>' + body + '</r>'; assert.equal(formatted(text), text);
  }
  const protectedNode = '<a xml:space="preserve"> \r\n<b><c xml:space="default"><d/></c>  </b></a>';
  assert.equal(formatted('<r>' + protectedNode + '<x/></r>'), '<r>\n  ' + protectedNode + '\n  <x/>\n</r>');
  assert.equal(formatted('<a xml:space="preserve"><b xml:space="default"><c/></b></a>'), '<a xml:space="preserve"><b xml:space="default"><c/></b></a>');
});
test('strict grammar accepts supported XML 1.0 and namespace scopes', () => {
  for (const source of [
    '<r/>', '<한글 属性="값">😀</한글>', '<𐀀/>', '<r> &lt;&gt;&amp;&apos;&quot;&#9;&#x10FFFF; </r>',
    '<r xmlns="urn:r" xmlns:p="urn:p"><p:a p:x="1"/><a xmlns:p="urn:other" p:x="2"/></r>',
    '<r xmlns:p="urn:p"><a xmlns:p="urn:a"/><p:b/></r>',
    '<r xmlns="urn:r" x="1" xmlns:p="urn:r" p:x="2"/>',
    '<r xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:lang="ko"/>',
    '<!--before--><?ok?><r a="one\r\ntwo"/><!--after-->',
  ]) assert.equal(run(source, 'validate').ok, true, source);
});
test('rejects malformed documents without recovery in both operations', () => {
  for (const source of [
    '', ' \t\r\n', '<a/><b/>', 'x<a/>', '<a/>x', '<a>', '</a>', '<a><b></a>', '<a></A>',
    '<1a/>', '<a:b:c/>', '<a:1b xmlns:a="urn:a"/>', '<a x="1"x="2"/>', '<a x=1/>', '<a x/>',
    '<a x="1" x="2"/>', '<a x="<"/>', '<a x="unfinished>', '<a / >', '<a></a x>',
    '<a>&no;</a>', '<a>&amp</a>', '<a>&#0;</a>', '<a>&#xD800;</a>', '<a>&#x110000;</a>',
    '<a>&#X41;</a>', '<a>&#;</a>', '<a>\u0001</a>', '<a>\ud800</a>', '<a>]]></a>',
    '<!--x--y--><a/>', '<!--x---><a/>', '<!--unfinished', '<![CDATA[x]]><a/>', '<a><![CDATA[x</a>',
    '<?xml?><a/>', ' <?xml version="1.0"?><a/>', '<?XML version="1.0"?><a/>',
    '<?xml version="1.0" extra="x"?><a/>', '<?xml version="1.0"? > <a/>', '<?p:x?><a/>',
    '<p:a/>', '<r p:a="1"/>', '<r xmlns:p=""/>', '<r xmlns:xmlns="urn:x"/>',
    '<r xmlns:xml="urn:x"/>', '<r xmlns="http://www.w3.org/XML/1998/namespace"/>',
    '<r xmlns:p="http://www.w3.org/2000/xmlns/"/>', '<xmlns:r/>',
    '<r xmlns:p="urn:x" xmlns:q="urn:x" p:a="1" q:a="2"/>',
    '<r xmlns:p="urn:x"><a xmlns:q="urn:q"/><q:b/></r>', '<r xml:space="other"/>',
  ]) for (const action of ['validate', 'format']) {
    const result = run(source, action); assert.equal(result.ok, false, source);
    assert.ok(result.error.offset >= 0 && result.error.offset <= source.length, source);
  }
});
test('unsupported declarations are distinguished and inert comment/CDATA strings are allowed', () => {
  for (const source of ['<!DOCTYPE r SYSTEM "https://example.invalid/a"><r/>', '<!DOCTYPE r [<!ENTITY e "x">]><r>&e;</r>', '<!ENTITY e "x"><r/>', '<?xml version="1.1"?><r/>', '<?xml version="1.0" encoding="UTF-16"?><r/>']) {
    const result = run(source); assert.equal(result.ok, false); assert.equal(result.kind, 'unsupported'); assert.ok(result.error.message);
  }
  assert.equal(run('<r><!-- <!DOCTYPE r> --><![CDATA[<!ENTITY x "y">]]></r>').ok, true);
});
test('source diagnostics account for BOM, CRLF, CR, LF and UTF-16 surrogate pairs', () => {
  const source = '\uFEFF<r>\r\n<a/>\r<b/>\n한😀</wrong>';
  const result = run(source);
  assert.deepEqual({ offset: result.error.offset, line: result.error.line, column: result.error.column }, { offset: source.indexOf('</wrong>'), line: 4, column: 4 });
  const attribute = '<r a="x\r\n&amp; &#0;"/>';
  assert.equal(run(attribute).error.offset, attribute.indexOf('&#0;'));
});
test('iterative deep parsing and output growth limit fail without recursive overflow', () => {
  const source = '<a>'.repeat(20000) + '<b/>' + '</a>'.repeat(20000);
  assert.equal(run(source, 'validate').ok, true);
  const result = run(source);
  assert.equal(result.ok, false); assert.equal(result.kind, 'error'); assert.match(result.error.message, /40 MiB/);
  assert.equal(formatted('<r/>'), '<r/>');
});
test('near input limit text remains intact and incomplete references terminate', () => {
  const source = '<r>' + 'a'.repeat(10 * 1024 * 1024 - 7) + '</r>';
  assert.equal(formatted(source), source);
  assert.equal(run('<r>' + '&'.repeat(100000) + '</r>').ok, false);
});
