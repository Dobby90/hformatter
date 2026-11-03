import type { Action, Diagnostic, Options, Result } from '../types.ts';

type Token = { raw: string; offset: number; kind: 'string' | 'number' | 'literal' | 'punct' };
type Frame = { type: 'object' | 'array'; state: 'keyOrEnd' | 'key' | 'colon' | 'valueOrEnd' | 'value' | 'commaOrEnd' };
class SyntaxIssue extends Error {
  offset: number;
  constructor(message: string, offset: number) { super(message); this.offset = offset; }
}
const whitespace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Strict, iterative parser. Lexemes stay intact (numbers, duplicate keys, escapes). */
function* scan(text: string): Generator<Token> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const c = text[i];
    if (whitespace(c)) { i++; continue; }
    const offset = i;
    if ('{}[]:,'.includes(c)) { yield { raw: c, offset, kind: 'punct' }; i++; continue; }
    if (c === '"') {
      i++;
      let closed = false;
      while (i < text.length) {
        const ch = text[i++];
        if (ch === '"') { closed = true; break; }
        if (ch.charCodeAt(0) < 0x20) throw new SyntaxIssue('문자열의 제어 문자는 이스케이프해야 합니다.', i - 1);
        if (ch === '\\') {
          const escape = text[i++];
          if (escape === 'u') {
            for (let n = 0; n < 4; n++) {
              if (!text[i] || !/[0-9a-fA-F]/.test(text[i])) throw new SyntaxIssue('유니코드 이스케이프는 16진수 네 자리여야 합니다.', i);
              i++;
            }
          } else if (!escape || !'"\\/bfnrt'.includes(escape)) throw new SyntaxIssue('올바르지 않은 이스케이프 문자입니다.', Math.min(i - 1, text.length));
        }
      }
      if (!closed) throw new SyntaxIssue('문자열을 닫는 큰따옴표가 필요합니다.', text.length);
      yield { raw: text.slice(offset, i), offset, kind: 'string' };
      continue;
    }
    if (c === '-' || /[0-9]/.test(c)) {
      if (c === '-') i++;
      if (text[i] === '0') i++;
      else if (text[i] && /[1-9]/.test(text[i])) { do { i++; } while (text[i] && /[0-9]/.test(text[i])); }
      else throw new SyntaxIssue('숫자가 필요합니다.', i);
      if (text[i] === '.') {
        i++;
        if (!text[i] || !/[0-9]/.test(text[i])) throw new SyntaxIssue('소수점 다음에 숫자가 필요합니다.', i);
        while (text[i] && /[0-9]/.test(text[i])) i++;
      }
      if (text[i] === 'e' || text[i] === 'E') {
        i++;
        if (text[i] === '+' || text[i] === '-') i++;
        if (!text[i] || !/[0-9]/.test(text[i])) throw new SyntaxIssue('지수에 숫자가 필요합니다.', i);
        while (text[i] && /[0-9]/.test(text[i])) i++;
      }
      yield { raw: text.slice(offset, i), offset, kind: 'number' }; continue;
    }
    const literal = ['true', 'false', 'null'].find(value => text.startsWith(value, i));
    if (literal) { i += literal.length; yield { raw: literal, offset, kind: 'literal' }; continue; }
    throw new SyntaxIssue('JSON 값 또는 올바른 구분자가 필요합니다. 키와 문자열에는 큰따옴표를 사용하세요.', i);
  }
}

export function diagnostic(text: string, issue: SyntaxIssue): Diagnostic {
  let line = 1, column = 1;
  for (let i = 0; i < Math.min(issue.offset, text.length); i++) {
    if (text[i] === '\r') { line++; column = 1; if (text[i + 1] === '\n' && i + 1 < issue.offset) i++; }
    else if (text[i] === '\n') { line++; column = 1; }
    else column++;
  }
  return { message: issue.message, offset: issue.offset, line, column };
}

// Bound output growth as deeply nested pretty JSON can expand quadratically.
const encoder = new TextEncoder();
export const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;
export function processJson(text: string, action: Action, options: Options = { indent: '2' }): Result {
  if (!['2', '4', 'tab'].includes(options.indent)) throw new Error('지원하지 않는 들여쓰기 옵션입니다.');
  const frames: Frame[] = [];
  let root = false;
  const output: string[] = [];
  let outputBytes = 0;
  const unit = options.indent === 'tab' ? '\t' : ' '.repeat(Number(options.indent));
  const pretty = action === 'format';
  let previous = '';
  const append = (value: string) => {
    if (action === 'validate') return;
    outputBytes += encoder.encode(value).length;
    if (outputBytes > MAX_OUTPUT_BYTES) throw new Error('결과가 40 MiB를 초과합니다. 압축을 사용하거나 입력을 나누세요.');
    output.push(value);
  };
  const newline = (depth: number) => { if (pretty) append('\n' + unit.repeat(depth)); };
  try {
    for (const token of scan(text)) {
      const raw = token.raw;
      const frame = frames.at(-1);
      const fail = (message: string): never => { throw new SyntaxIssue(message, token.offset); };
      if (frame?.state === 'colon') {
        if (raw !== ':') fail('키 다음에 콜론(:)이 필요합니다.');
        frame.state = 'value'; append(pretty ? ': ' : ':'); previous = raw; continue;
      }
      if (frame?.state === 'commaOrEnd') {
        const end = frame.type === 'object' ? '}' : ']';
        if (raw === ',') { frame.state = frame.type === 'object' ? 'key' : 'value'; append(','); newline(frames.length); previous = raw; continue; }
        if (raw !== end) fail(`쉼표(,) 또는 ${end}가 필요합니다.`);
        frames.pop(); newline(frames.length); append(raw); previous = raw; continue;
      }
      if (frame?.type === 'object' && (frame.state === 'keyOrEnd' || frame.state === 'key')) {
        if (raw === '}' && frame.state === 'keyOrEnd') { frames.pop(); append(raw); previous = raw; continue; }
        if (token.kind !== 'string') fail('객체의 키는 큰따옴표로 감싼 문자열이어야 합니다. 후행 쉼표는 허용되지 않습니다.');
        if (previous === '{') newline(frames.length);
        append(raw); frame.state = 'colon'; previous = raw; continue;
      }
      if (frame?.type === 'array' && frame.state === 'valueOrEnd' && raw === ']') { frames.pop(); append(raw); previous = raw; continue; }
      if (!frame && root) fail('최상위 JSON 값은 하나만 허용됩니다.');
      if (token.kind === 'punct' && raw !== '{' && raw !== '[') fail('JSON 값이 필요합니다. 후행 쉼표 또는 닫는 괄호를 확인하세요.');
      if (previous === '[') newline(frames.length);
      if (frame) frame.state = 'commaOrEnd'; else root = true;
      append(raw);
      if (raw === '{') frames.push({ type: 'object', state: 'keyOrEnd' });
      if (raw === '[') frames.push({ type: 'array', state: 'valueOrEnd' });
      previous = raw;
    }
    if (!root) throw new SyntaxIssue('JSON 값을 입력하세요.', text.length);
    if (frames.length) throw new SyntaxIssue('JSON이 끝나지 않았습니다. 값 또는 닫는 괄호를 확인하세요.', text.length);
    return { ok: true, text: output.join('') };
  } catch (error) {
    if (error instanceof SyntaxIssue) return { ok: false, error: diagnostic(text, error) };
    throw error;
  }
}
