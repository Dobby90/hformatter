import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { xmlLanguage } from '../src/formatters/xml/language.ts';

function foldAt(state, lineNumber) {
  const line = state.doc.line(lineNumber);
  return foldable(state, line.from, line.to);
}

test('XML folding ignores markup in quotes, comments, CDATA and processing instructions', () => {
  const source = [
    '<r note="> <fake>">',
    '<!-- <fake>',
    '</fake> -->',
    '<![CDATA[<fake>',
    '</fake>]]>',
    '<?p <fake>',
    '</fake>?>',
    "<child note='> <fake>'>",
    '  <leaf/>',
    '</child>',
    '</r>',
  ].join('\n');
  const state = EditorState.create({ doc: source, extensions: xmlLanguage });
  assert.deepEqual(foldAt(state, 1), {
    from: source.indexOf('\n'), to: source.lastIndexOf('</r>'),
  });
  assert.deepEqual(foldAt(state, 8), {
    from: source.indexOf('\n', source.indexOf('<child')), to: source.indexOf('</child>'),
  });
  for (const line of [2, 3, 4, 5, 6, 7, 9, 10, 11]) assert.equal(foldAt(state, line), null);
  // Repeated gutter queries use the same document's cached ranges.
  assert.deepEqual(foldAt(state, 1), {
    from: source.indexOf('\n'), to: source.lastIndexOf('</r>'),
  });
});

test('unfinished markup ends scanning safely and folding recovers on a changed document', () => {
  for (const tail of ['<unfinished', '<unfinished a="', '<!--', '<![CDATA[', '<?p']) {
    const source = '<r>\n<child>\n<leaf/>\n</child>\n' + tail;
    const state = EditorState.create({ doc: source, extensions: xmlLanguage });
    assert.equal(foldAt(state, 1), null);
    assert.deepEqual(foldAt(state, 2), {
      from: source.indexOf('\n', source.indexOf('<child>')), to: source.indexOf('</child>'),
    });
    const recovered = state.update({ changes: { from: source.indexOf(tail), to: source.length, insert: '</r>' } }).state;
    assert.deepEqual(foldAt(recovered, 1), { from: 3, to: source.indexOf(tail) });
  }
  const source = '<unfinished <r>\n<leaf/>\n</r>';
  const state = EditorState.create({ doc: source, extensions: xmlLanguage });
  assert.deepEqual(foldAt(state, 1), { from: source.indexOf('\n'), to: source.indexOf('</r>') });
});
