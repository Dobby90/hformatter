import type { Action, Diagnostic, Options, Result } from '../types.ts';

const XML_URI = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_URI = 'http://www.w3.org/2000/xmlns/';
const MAX_OUTPUT = 40 * 1024 * 1024;
const encoder = new TextEncoder();
const space = (s: string) => /^[ \t\r\n]*$/.test(s);
const namePattern = /[:A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}][:A-Z_a-z0-9.\-\u00b7\u0300-\u036f\u203f-\u2040\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}]*/uy;
const validChar = (n: number) => n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
type Part = { start: number; end: number; element?: ElementNode };
type ElementNode = { name: string; start: number; openEnd: number; closeStart: number; end: number; children: Part[]; preserve: boolean; text: boolean; elements: boolean; bindings: [string, string | undefined][] };
type Attribute = { name: string; value: string; offset: number };
class XmlIssue extends Error {
  offset: number;
  unsupported: boolean;
  constructor(message: string, offset: number, unsupported = false) { super(message); this.offset = offset; this.unsupported = unsupported; }
}
function diagnostic(text: string, issue: XmlIssue): Diagnostic {
  let line = 1, column = 1;
  for (let i = 0; i < issue.offset; i++) {
    if (text[i] === '\r') { line++; column = 1; if (text[i + 1] === '\n' && i + 1 < issue.offset) i++; }
    else if (text[i] === '\n') { line++; column = 1; }
    else column++;
  }
  return { message: issue.message, offset: issue.offset, line, column };
}

// No DOM, resource loader, error recovery or entity expansion is involved.
export function processXml(text: string, action: Action, options: Options): Result {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const beginning = i;
  const fail: (message: string, at?: number) => never = (message, at = i) => { throw new XmlIssue(message, at); };
  const unsupported: (message: string, at?: number) => never = (message, at = i) => { throw new XmlIssue(message, at, true); };
  const whitespace = () => { const start = i; while (i < text.length && /[ \t\r\n]/.test(text[i])) i++; return i > start; };
  const name = () => {
    namePattern.lastIndex = i;
    const match = namePattern.exec(text);
    if (!match) return fail('올바른 XML 이름이 필요합니다.');
    i = namePattern.lastIndex; return match[0];
  };
  const qname = (value: string, at: number) => {
    const parts = value.split(':');
    if (parts.length > 2 || parts.some(part => !part || /^[0-9.\-\u00b7\u0300-\u036f\u203f-\u2040]/u.test(part))) fail('네임스페이스 이름 구문이 올바르지 않습니다.', at);
    return parts.length === 2 ? parts : ['', value];
  };
  const references = (raw: string, offset: number, attribute = false) => {
    return raw.replace(/&([^&;]*);|&|\r\n?|\n|\t/g, (whole: string, body: string | undefined, local: number) => {
      if (whole[0] !== '&') return attribute ? ' ' : whole;
      const originalAt = offset + local;
      if (body === undefined) return fail('문자 참조는 세미콜론으로 끝나야 합니다.', originalAt);
      const predefined: Record<string, string> = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };
      if (Object.hasOwn(predefined, body)) return predefined[body];
      if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(body)) return fail('정의되지 않았거나 잘못된 엔티티 참조입니다.', originalAt);
      const value = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      if (!validChar(value)) return fail('XML에서 허용하지 않는 문자 참조입니다.', originalAt);
      return String.fromCodePoint(value);
    });
  };
  const stack: ElementNode[] = [], document: Part[] = [];
  const namespaces = new Map<string, string>([['xml', XML_URI]]);
  let roots = 0;
  const add = (part: Part) => (stack.at(-1)?.children ?? document).push(part);
  const restore = (node: ElementNode) => { for (const [prefix, previous] of node.bindings) { if (previous === undefined) namespaces.delete(prefix); else namespaces.set(prefix, previous); } };
  try {
    if (action === 'minify') return unsupported('XML 압축은 지원하지 않습니다.');
    if (!['2', '4', 'tab'].includes(options.indent)) throw new Error('지원하지 않는 들여쓰기입니다.');
    for (let at = beginning; at < text.length;) {
      const code = text.codePointAt(at)!;
      if (!validChar(code)) fail('XML에서 허용하지 않는 문자입니다.', at);
      at += code > 0xffff ? 2 : 1;
    }
    while (i < text.length) {
      const start = i;
      if (text[i] !== '<') {
        while (i < text.length && text[i] !== '<') i++;
        const raw = text.slice(start, i);
        if (!stack.length) { if (!space(raw)) fail('루트 요소 밖에는 공백만 허용됩니다.', start); }
        else {
          const forbidden = raw.indexOf(']]>');
          if (forbidden >= 0) fail('일반 텍스트에 ]]>를 사용할 수 없습니다.', start + forbidden);
          references(raw, start);
          if (!space(raw)) stack.at(-1)!.text = true;
          add({ start, end: i });
        }
        continue;
      }
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        if (end < 0) fail('주석이 끝나지 않았습니다.', start);
        const body = text.slice(i + 4, end);
        if (body.includes('--') || body.endsWith('-')) fail('주석 내부에 -- 또는 끝의 -를 사용할 수 없습니다.', start);
        i = end + 3; add({ start, end: i }); continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        if (!stack.length) fail('CDATA는 요소 내부에서만 사용할 수 있습니다.');
        const end = text.indexOf(']]>', i + 9);
        if (end < 0) fail('CDATA가 끝나지 않았습니다.', start);
        i = end + 3; stack.at(-1)!.text = true; add({ start, end: i }); continue;
      }
      if (text.startsWith('<?', i)) {
        i += 2; const target = name();
        const end = text.indexOf('?>', i);
        if (end < 0) fail('처리 명령이 끝나지 않았습니다.', start);
        const body = text.slice(i, end);
        if (target.toLowerCase() === 'xml') {
          if (target !== 'xml' || start !== beginning) fail('XML 선언은 문서의 맨 앞에 한 번만 허용됩니다.', start);
          const declaration = /^[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(['"])(1\.[0-9]+)\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(['"])([A-Za-z][A-Za-z0-9._-]*)\3)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(['"])(yes|no)\5)?[ \t\r\n]*$/.exec(body);
          if (!declaration) fail('XML 선언 구문이 올바르지 않습니다.', start);
          if (declaration[2] !== '1.0') unsupported('XML 1.0만 지원합니다.', start);
          if (declaration[4] && !/^utf-8$/i.test(declaration[4])) unsupported('XML 인코딩은 UTF-8만 지원합니다.', start);
        } else {
          if (target.includes(':')) fail('처리 명령 이름에 콜론을 사용할 수 없습니다.', start);
          if (body && !/^[ \t\r\n]/.test(body)) fail('처리 명령 이름 뒤에 공백이 필요합니다.');
        }
        i = end + 2; add({ start, end: i }); continue;
      }
      if (text.startsWith('<!', i)) unsupported('DOCTYPE·DTD·엔티티 및 기타 선언은 지원하지 않습니다. 외부 리소스를 불러오거나 확장하지 않습니다.', start);
      if (text.startsWith('</', i)) {
        i += 2; const closing = name(); whitespace();
        if (text[i] !== '>') fail('종료 태그에 >가 필요합니다.');
        const node = stack.at(-1);
        if (!node || node.name !== closing) fail('종료 태그가 열린 요소와 일치하지 않습니다.', start);
        i++; node.closeStart = start; node.end = i; stack.pop(); restore(node); continue;
      }
      i++; const tag = name(); qname(tag, start + 1);
      const attributes: Attribute[] = [], names = new Set<string>();
      while (true) {
        const separated = whitespace();
        if (text[i] === '>' || text.startsWith('/>', i)) break;
        if (!separated) fail('속성 앞에 공백이 필요합니다.');
        const offset = i, key = name(); qname(key, offset);
        if (names.has(key)) fail('중복된 속성 이름입니다.', offset);
        names.add(key); whitespace();
        if (text[i++] !== '=') fail('속성 이름 뒤에 =가 필요합니다.', i - 1);
        whitespace(); const quote = text[i++];
        if (quote !== '"' && quote !== "'") fail('속성값을 따옴표로 감싸세요.', i - 1);
        const valueStart = i, end = text.indexOf(quote, i);
        if (end < 0) fail('속성값이 끝나지 않았습니다.', valueStart);
        const raw = text.slice(i, end);
        if (raw.includes('<')) fail('속성값에 <를 직접 사용할 수 없습니다.', i + raw.indexOf('<'));
        const value = references(raw, valueStart, true);
        attributes.push({ name: key, value, offset }); i = end + 1;
      }
      const parent = stack.at(-1);
      if (!parent && ++roots > 1) fail('루트 요소는 하나만 허용됩니다.', start);
      const node: ElementNode = { name: tag, start, openEnd: 0, closeStart: 0, end: 0, children: [], preserve: parent?.preserve ?? false, text: false, elements: false, bindings: [] };
      for (const attribute of attributes) {
        const [prefix, local] = qname(attribute.name, attribute.offset);
        if (attribute.name === 'xmlns' || prefix === 'xmlns') {
          const binding = prefix ? local : '', uri = attribute.value;
          if (binding === 'xmlns' || uri === XMLNS_URI || (binding === 'xml') !== (uri === XML_URI) || (binding && !uri)) fail('예약되었거나 잘못된 네임스페이스 바인딩입니다.', attribute.offset);
          node.bindings.push([binding, namespaces.get(binding)]); namespaces.set(binding, uri);
        }
      }
      const [prefix] = qname(tag, start + 1);
      if (prefix === 'xmlns' || (prefix && !namespaces.get(prefix))) fail('선언되지 않았거나 예약된 요소 접두사입니다.', start + 1);
      const expanded = new Set<string>();
      for (const attribute of attributes) {
        const [prefix, local] = qname(attribute.name, attribute.offset);
        if (attribute.name === 'xmlns' || prefix === 'xmlns') continue;
        if (prefix && !namespaces.get(prefix)) fail('선언되지 않은 속성 접두사입니다.', attribute.offset);
        const key = (prefix ? namespaces.get(prefix) : '') + '\u0000' + local;
        if (expanded.has(key)) fail('동일한 확장 이름의 속성이 중복됩니다.', attribute.offset);
        expanded.add(key);
        if (attribute.name === 'xml:space') {
          if (attribute.value !== 'default' && attribute.value !== 'preserve') fail('xml:space는 default 또는 preserve여야 합니다.', attribute.offset);
          node.preserve = attribute.value === 'preserve';
        }
      }
      const empty = text.startsWith('/>', i); i += empty ? 2 : 1;
      node.openEnd = i; node.end = i; node.closeStart = i;
      if (parent) parent.elements = true;
      add({ start, end: i, element: node });
      if (empty) restore(node); else stack.push(node);
    }
    if (stack.length) fail('요소가 끝나지 않았습니다. 종료 태그를 확인하세요.', text.length);
    if (!roots) fail('XML 루트 요소를 입력하세요.', text.length);
    if (action === 'validate') return { ok: true, text: '' };

    const unit = options.indent === 'tab' ? '\t' : ' '.repeat(Number(options.indent));
    const output: string[] = []; let bytes = 0;
    const append = (raw: string) => {
      bytes += encoder.encode(raw).length;
      if (bytes > MAX_OUTPUT) throw new Error('XML 결과가 40 MiB를 초과합니다. 입력을 나누거나 중첩 깊이를 줄이세요.');
      output.push(raw);
    };
    const newline = (depth: number) => {
      if (bytes + 1 + depth * unit.length > MAX_OUTPUT) throw new Error('XML 결과가 40 MiB를 초과합니다. 입력을 나누거나 중첩 깊이를 줄이세요.');
      append('\n' + unit.repeat(depth));
    };
    type Task = { part: Part; depth: number; close?: boolean; newline: boolean };
    const tasks: Task[] = document.slice().reverse().map((part, index) => ({ part, depth: 0, newline: index !== document.length - 1 }));
    if (beginning) append('\uFEFF');
    while (tasks.length) {
      const task = tasks.pop()!, node = task.part.element;
      if (task.newline) newline(task.depth);
      if (!node) { append(text.slice(task.part.start, task.part.end)); continue; }
      if (task.close) { append(text.slice(node.closeStart, node.end)); continue; }
      if (node.preserve || node.text || !node.elements) { append(text.slice(node.start, node.end)); continue; }
      append(text.slice(node.start, node.openEnd));
      tasks.push({ part: task.part, depth: task.depth, close: true, newline: true });
      for (let n = node.children.length - 1; n >= 0; n--) {
        const child = node.children[n];
        if (!child.element && space(text.slice(child.start, child.end))) continue;
        tasks.push({ part: child, depth: task.depth + 1, newline: true });
      }
    }
    return { ok: true, text: output.join('') };
  } catch (error) {
    if (error instanceof XmlIssue) return { ok: false, ...(error.unsupported ? { kind: 'unsupported' as const } : {}), error: diagnostic(text, error) };
    if (error instanceof Error) return { ok: false, kind: 'error', error: { message: error.message } };
    throw error;
  }
}
