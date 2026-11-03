import { format } from 'sql-formatter';
import type { Action, Diagnostic, Options, Result } from '../types.ts';
import { SQL_DIALECTS } from './config.ts';
import type { SqlDialect } from './config.ts';

type ParseError = Error & { location?: { start?: { offset: number } }; found?: string | null };
function diagnostic(text: string, message: string, offset?: number): Diagnostic {
  if (offset === undefined) return { message };
  const at = Math.max(0, Math.min(text.length, offset));
  const lines = text.slice(0, at).split(/\r\n|\r|\n/);
  return { message, offset: at, line: lines.length, column: lines.at(-1)!.length + 1 };
}
async function validate(text: string, dialect: SqlDialect): Promise<string | undefined> {
  if (dialect === 'plsql') {
    return (await import('./oracle/validate.ts')).validateOracle(text);
  }
  if (dialect === 'clickhouse') {
    const { parse, findNodes } = await import('@clickhouse/parser');
    const statements = parse(text);
    // VALUES / FORMAT payloads are deliberately omitted by the upstream parser.
    // Reject partial checks, including INSERTs nested in EXPLAIN or other wrappers.
    if (findNodes(statements, 'InsertQuery').some(node => !node.select || node.format || node.infile)) {
      return '검사 미지원 · ClickHouse INSERT VALUES·FORMAT·외부 데이터는 파서가 데이터 부분을 검사하지 않습니다. INSERT … SELECT 또는 일반 쿼리를 사용하세요.';
    }
    return;
  }
  // Import only the selected grammar; never send SQL to a server.
  const module = dialect === 'postgresql' ? await import('node-sql-parser/build/postgresql.js')
    : dialect === 'mysql' ? await import('node-sql-parser/build/mysql.js')
    : await import('node-sql-parser/build/mariadb.js');
  new module.default.Parser().astify(text);
}
export async function processSql(text: string, action: Action, options: Options): Promise<Result> {
  const dialect = options.dialect ?? 'postgresql';
  const selected = SQL_DIALECTS.find(item => item.id === dialect);
  if (!selected) throw new Error('지원하지 않는 DB 종류입니다.');
  if (!['2', '4', 'tab'].includes(options.indent)) throw new Error('지원하지 않는 들여쓰기입니다.');
  const keywordCase = options.keywordCase ?? 'preserve';
  if (!['preserve', 'upper', 'lower'].includes(keywordCase)) throw new Error('지원하지 않는 키워드 옵션입니다.');
  if (action === 'minify') throw new Error('SQL 압축은 지원하지 않습니다.');
  if (action === 'validate' && !selected.validate) return { ok: false, error: { message: `${selected.name} 문법 검사는 추후 구현 예정입니다.` } };
  const bom = text.startsWith('\uFEFF') ? 1 : 0;
  const source = text.slice(bom);
  if (!source.trim()) return { ok: false, error: { message: 'SQL을 입력하세요.' } };
  try {
    if (action === 'validate') {
      const unsupported = await validate(source, dialect);
      if (unsupported) return { ok: false, kind: 'unsupported', error: { message: unsupported } };
      return { ok: true, text };
    }
    const formatted = format(source, {
      language: dialect, tabWidth: options.indent === '4' ? 4 : 2,
      useTabs: options.indent === 'tab', keywordCase,
      // Identifier, literal and function case are intentionally preserved.
    });
    if (new TextEncoder().encode(formatted).length > 40 * 1024 * 1024) throw new RangeError('결과가 40 MiB를 초과합니다. 입력을 나누세요.');
    return { ok: true, text: formatted };
  } catch (error) {
    const failure = error as ParseError;
    if (failure instanceof RangeError) throw failure;
    if (action === 'validate') {
      if (!failure.location?.start) throw error; // Import/runtime failures are not syntax errors.
      const found = failure.found == null ? '문장 끝' : JSON.stringify(failure.found).slice(0, 80);
      return { ok: false, error: diagnostic(text, `구문 분석 실패 · ${found} 부근을 확인하세요. 파서가 지원하지 않는 구문일 수도 있습니다.`, failure.location.start.offset + bom) };
    }
    const position = failure.message.match(/(?:at )?line (\d+) (?:column|col) (\d+)/i);
    let offset: number | undefined;
    if (position) {
      const lines = source.split(/\r\n|\r|\n/);
      const target = Number(position[1]) - 1;
      const matches = [...source.matchAll(/\r\n|\r|\n/g)];
      if (target >= 0 && target < lines.length) offset = (target ? matches[target - 1].index! + matches[target - 1][0].length : 0) + Number(position[2]) - 1 + bom;
    }
    return { ok: false, error: diagnostic(text, 'SQL 포매팅 실패 · DB 종류와 입력 구문을 확인하세요. ' + failure.message.slice(0, 240), offset) };
  }
}
