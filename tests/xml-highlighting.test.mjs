import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { xmlLanguage } from '../src/formatters/xml/language.ts';

const highlighter = tagHighlighter([
  { tag: tags.typeName, class: 'element' },
  { tag: tags.propertyName, class: 'attribute' },
  { tag: tags.string, class: 'value' },
  { tag: tags.escape, class: 'reference' },
]);

function highlight(source) {
  const spans = [];
  highlightTree(xmlLanguage[0].parser.parse(source), highlighter, (from, to, style) => {
    spans.push({ from, to, style });
  });
  return spans;
}

function expectHighlight(spans, from, token, style) {
  assert.ok(from >= 0, 'expected token must exist in the source');
  assert.ok(spans.some(span => span.from <= from && span.to >= from + token.length
    && span.style.split(' ').includes(style)), 'missing ' + style + ' highlight at ' + from);
}

test('XML highlighting reaches references after long text and markup on following lines', () => {
  for (const length of [12_000, 128 * 1024]) {
    const plain = 'a'.repeat(length);
    const source = '<r>' + plain + '&amp;\n<leaf attr="value"/>\n</r>';
    const spans = highlight(source);
    expectHighlight(spans, source.indexOf('&amp;'), '&amp;', 'reference');
    expectHighlight(spans, source.indexOf('leaf'), 'leaf', 'element');
    expectHighlight(spans, source.indexOf('attr'), 'attr', 'attribute');
    expectHighlight(spans, source.indexOf('value'), 'value', 'value');
    expectHighlight(spans, source.lastIndexOf('</r>') + 2, 'r', 'element');
    assert.deepEqual(spans.filter(span => span.from < 3 + length && span.to > 3), [],
      'ordinary text must stay unstyled instead of being consumed as markup');
  }
});

test('unfinished references and invalid delimiters do not hide later XML tokens during editing', () => {
  const source = '<r>&unfinished ' + '< '.repeat(20)
    + 'b'.repeat(12_000) + '&amp;\n<recovered/>\n</r>';
  const spans = highlight(source);
  expectHighlight(spans, source.indexOf('&amp;'), '&amp;', 'reference');
  expectHighlight(spans, source.indexOf('recovered'), 'recovered', 'element');
  expectHighlight(spans, source.lastIndexOf('</r>') + 2, 'r', 'element');

  const repaired = '<r>' + 'a'.repeat(12_000) + '&amp;\n<recovered/>\n</r>';
  const repairedSpans = highlight(repaired);
  expectHighlight(repairedSpans, repaired.indexOf('&amp;'), '&amp;', 'reference');
  expectHighlight(repairedSpans, repaired.indexOf('recovered'), 'recovered', 'element');
  expectHighlight(repairedSpans, repaired.lastIndexOf('</r>') + 2, 'r', 'element');
});
