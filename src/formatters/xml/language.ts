import { StreamLanguage, foldService } from '@codemirror/language';
import type { Text } from '@codemirror/state';

type State = { mode: 'text' | 'tag' | 'comment' | 'cdata' | 'pi'; quote: string };
const language = StreamLanguage.define<State>({
  startState: () => ({ mode: 'text', quote: '' }),
  token(stream, state) {
    if (state.mode === 'comment' || state.mode === 'cdata' || state.mode === 'pi') {
      const end = state.mode === 'comment' ? '-->' : state.mode === 'cdata' ? ']]>' : '?>';
      const style = state.mode === 'cdata' ? 'string' : 'comment';
      while (!stream.eol()) { if (stream.match(end)) { state.mode = 'text'; break; } stream.next(); }
      return style;
    }
    if (state.mode === 'tag') {
      if (state.quote) {
        while (!stream.eol()) { if (stream.next() === state.quote) { state.quote = ''; break; } }
        return 'string';
      }
      if (stream.eatSpace()) return null;
      if (stream.match('/>') || stream.match('>')) { state.mode = 'text'; return 'punctuation'; }
      const char = stream.peek();
      if (char === '"' || char === "'") { state.quote = stream.next()!; return 'string'; }
      if (stream.eat('=')) return 'punctuation';
      if (stream.match(/[^\s=<>/'"]+/)) return 'propertyName';
      stream.next(); return null;
    }
    if (stream.match('<!--')) { state.mode = 'comment'; return 'comment'; }
    if (stream.match('<![CDATA[')) { state.mode = 'cdata'; return 'string'; }
    if (stream.match('<?')) { state.mode = 'pi'; return 'comment'; }
    if (stream.match(/<\/?[^\s<>/]+/)) { state.mode = 'tag'; return 'typeName'; }
    if (stream.match(/&[^&;\s]*;/)) return 'escape';
    stream.next(); return null;
  },
});
const folds = new WeakMap<Text, Map<number, { from: number; to: number }>>();
export const xmlLanguage = [
  language,
  foldService.of((state, lineStart, lineEnd) => {
    let ranges = folds.get(state.doc);
    if (!ranges) {
      ranges = new Map(); folds.set(state.doc, ranges);
      const opened: { start: number; end: number; name: string }[] = [];
      const source = state.doc.toString();
      const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([^\s<>/]+)(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
      for (const match of source.matchAll(tokens)) {
        if (!match[1]) continue;
        const raw = match[0], start = match.index!;
        if (raw.startsWith('</')) {
          const open = opened.pop();
          if (!open || open.name !== match[1] || state.doc.lineAt(open.end).number === state.doc.lineAt(start).number) continue;
          const line = state.doc.lineAt(open.start).from;
          if (!ranges.has(line) || ranges.get(line)!.from > open.end) ranges.set(line, { from: open.end, to: start });
        } else if (!raw.endsWith('/>')) opened.push({ start, end: start + raw.length, name: match[1] });
      }
    }
    const range = ranges.get(lineStart);
    return range && range.from <= lineEnd ? range : null;
  }),
];
