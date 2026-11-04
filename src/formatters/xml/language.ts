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
      if (stream.match(/^[^\s=<>/'"]+/)) return 'propertyName';
      stream.next(); return null;
    }
    if (stream.match('<!--')) { state.mode = 'comment'; return 'comment'; }
    if (stream.match('<![CDATA[')) { state.mode = 'cdata'; return 'string'; }
    if (stream.match('<?')) { state.mode = 'pi'; return 'comment'; }
    if (stream.match(/^<\/?[^\s<>/]+/)) { state.mode = 'tag'; return 'typeName'; }
    if (stream.match(/^&[^&;\s]*;/)) return 'escape';
    // Consume ordinary text together; malformed delimiters must still advance.
    if (!stream.eatWhile(/[^<&]/)) stream.next();
    return null;
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
      // Scan forward without backtracking, including unfinished tags.
      // Overlapping regex repetitions can otherwise block the editor on a paste.
      let position = 0;
      while (position < source.length) {
        const start = source.indexOf('<', position);
        if (start < 0) break;
        const terminator = source.startsWith('<!--', start) ? '-->'
          : source.startsWith('<![CDATA[', start) ? ']]>'
          : source.startsWith('<?', start) ? '?>' : null;
        if (terminator) {
          const end = source.indexOf(terminator, start + (terminator === '-->' ? 4 : terminator === ']]>' ? 9 : 2));
          if (end < 0) break;
          position = end + terminator.length;
          continue;
        }
        let cursor = start + 1;
        const closing = source[cursor] === '/';
        if (closing) cursor++;
        const nameStart = cursor;
        while (cursor < source.length && !/[\s<>/'"=!?]/.test(source[cursor])) cursor++;
        if (cursor === nameStart) { position = cursor; continue; }
        const name = source.slice(nameStart, cursor);
        let quote = '', end = -1;
        for (; cursor < source.length; cursor++) {
          const char = source[cursor];
          if (quote) { if (char === quote) quote = ''; }
          else if (char === '"' || char === "'") quote = char;
          else if (char === '<') break;
          else if (char === '>') { end = cursor + 1; break; }
        }
        // Resume at an unquoted '<', or stop at EOF for incomplete markup.
        position = end < 0 ? cursor : end;
        if (end < 0) continue;
        if (closing) {
          const open = opened.pop();
          if (!open || open.name !== name || state.doc.lineAt(open.end).number === state.doc.lineAt(start).number) continue;
          const line = state.doc.lineAt(open.start).from;
          if (!ranges.has(line) || ranges.get(line)!.from > open.end) ranges.set(line, { from: open.end, to: start });
        } else if (source[end - 2] !== '/') opened.push({ start, end, name });
      }
    }
    const range = ranges.get(lineStart);
    return range && range.from <= lineEnd ? range : null;
  }),
];
