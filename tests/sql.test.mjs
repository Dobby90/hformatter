import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processSql } from '../src/formatters/sql/engine.ts';
import { SQL_DIALECTS, SQL_SAMPLES } from '../src/formatters/sql/config.ts';
import { readFile, downloadName } from '../src/services/files.ts';
const run = (text, action = 'format', dialect = 'postgresql', extra = {}) => processSql(text, action, { indent: '2', dialect, ...extra });
test('five dialects format their own examples and formatting is idempotent', async () => {
  for (const { id } of SQL_DIALECTS) {
    const result = await run(SQL_SAMPLES[id], 'format', id);
    assert.equal(result.ok, true, id);
    assert.ok(result.text.includes('\n'));
    assert.deepEqual(await run(result.text, 'format', id), result, id);
  }
});
test('three grammars parse CTE, joins, subqueries, windows, DML and multiple statements', async () => {
  for (const dialect of ['postgresql', 'mysql', 'mariadb']) {
    for (const text of [SQL_SAMPLES[dialect],
      'with totals as (select department, count(*) as n from users group by department) select * from totals where n > 1;',
      'select u.id, row_number() over (partition by u.department order by u.id) as rn from users u join departments d on u.department = d.id where u.id in (select user_id from events);',
      "insert into users (id, name) values (1, '한글'); update users set name = 'A' where id = 1; delete from users where id = 1;",
      'create table sample (id int, name varchar(100));',
    ]) {
      assert.equal((await run(text, 'validate', dialect)).ok, true, `${dialect}: ${text}`);
      const formatted = await run(text, 'format', dialect);
      assert.equal(formatted.ok, true);
      assert.equal((await run(formatted.text, 'validate', dialect)).ok, true);
    }
  }
});
test('syntax validation catches errors which whitespace formatting may accept', async () => {
  for (const dialect of ['postgresql', 'mysql', 'mariadb']) {
    for (const text of ['select * from;', 'select id from users where;', 'select (1 + 2;', "select 'unfinished", 'select 1; select * from;']) {
      const result = await run(text, 'validate', dialect);
      assert.equal(result.ok, false, `${dialect}: ${text}`);
      assert.ok(result.error.offset >= 0 && result.error.offset <= text.length);
    }
  }
});
test('diagnostics use original UTF-16 offsets with BOM, CRLF and Korean', async () => {
  const text = '\uFEFF-- 한글 😀\r\nselect *\r\nfrom;';
  const result = await run(text, 'validate');
  assert.equal(result.ok, false);
  assert.equal(result.error.offset, text.indexOf(';'));
  assert.equal(result.error.line, 3);
  assert.equal(result.error.column, 5);
});
test('format options preserve literals, identifiers, comments, hints and placeholders', async () => {
  for (const dialect of ['postgresql', 'mysql', 'mariadb', 'plsql', 'clickhouse']) {
    const text = "select /*+ KEEP_ME */ 'select ; -- 한글' as MixedCase, 900719925474099312345, 1.2300 from Users -- tail\nwhere id = 1;";
    const result = await run(text, 'format', dialect, { keywordCase: 'upper', indent: '4' });
    assert.equal(result.ok, true);
    for (const token of ["'select ; -- 한글'", 'MixedCase', '900719925474099312345', '1.2300', 'Users', '/*+ KEEP_ME */', '-- tail']) assert.ok(result.text.includes(token), `${dialect}: ${token}`);
    assert.match(result.text, /SELECT/);
  }
  assert.match((await run('select a from t', 'format', 'postgresql', { indent: 'tab' })).text, /\n\ta/);
  assert.match((await run('SELECT a FROM t', 'format', 'postgresql', { keywordCase: 'lower' })).text, /^select/);
  for (const [dialect, text, token] of [
    ['postgresql', 'select $1::int, $$hello;world$$;', '$$hello;world$$'],
    ['mysql', 'select `Mixed`, ? from `Table`;', '?'],
    ['plsql', 'select :user_id from dual;', ':user_id'],
    ['clickhouse', 'select {id:UInt64} from events final;', '{id:UInt64}'],
  ]) {
    const result = await run(text, 'format', dialect);
    assert.equal(result.ok, true);
    assert.ok(result.text.includes(token));
  }
});
test('invalid SQL options are rejected', async () => {
  await assert.rejects(run('select 1', 'minify'), /압축/);
  await assert.rejects(run('select 1', 'format', 'unknown'), /DB/);
  await assert.rejects(run('select 1', 'format', 'postgresql', { indent: '8' }), /들여쓰기/);
  await assert.rejects(run('select 1', 'format', 'postgresql', { keywordCase: 'wrong' }), /키워드/);
  assert.equal((await run(' \n')).ok, false);
});
test('SQL file import and filenames follow the selected format', async () => {
  assert.equal(await readFile(new File(['\uFEFFselect 1;'], 'query.SQL'), ['sql', 'txt']), 'select 1;');
  await assert.rejects(readFile(new File(['{}'], 'query.json'), ['sql', 'txt']), /sql/);
  assert.equal(downloadName('query.txt', 'sql'), 'query.formatted.sql');
  assert.equal(downloadName('', 'sql'), 'formatted.sql');
});

test('ClickHouse validates dedicated clauses, DDL, parameters and INSERT SELECT', async () => {
  for (const text of [SQL_SAMPLES.clickhouse,
    'select * from events final prewhere id > 1 limit 2 by user_id settings max_threads=2;',
    'select id, x from events array join tags as x;',
    'create table events (id UInt64, ts DateTime) engine = MergeTree partition by toYYYYMM(ts) order by id;',
    'select {id:UInt64}, arrayMap(x -> x + 1, [1, 2]);',
    'with totals as (select id, count() as n from events group by id) select id, row_number() over (order by n desc) from totals;',
    'select 1; insert into events select 2; select 3;',
    "select 'INSERT INTO t VALUES broken; FORMAT JSONEachRow' as message; -- VALUES is just text",
  ]) {
    const result = await run(text, 'validate', 'clickhouse');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.text, text);
  }
});
test('ClickHouse rejects incomplete syntax and reports original offsets after BOM, CRLF and Unicode', async () => {
  for (const text of ['select * from;', 'select id from t prewhere;', 'select (1;', "select 'unfinished", 'select 1; select * from;']) {
    const result = await run(text, 'validate', 'clickhouse');
    assert.equal(result.ok, false, text);
    assert.notEqual(result.kind, 'unsupported');
    assert.ok(result.error.offset >= 0 && result.error.offset <= text.length);
  }
  const text = '\uFEFF-- 한글 😀\r\nselect *\r\nfrom;';
  const result = await run(text, 'validate', 'clickhouse');
  assert.equal(result.ok, false);
  assert.equal(result.error.offset, text.indexOf(';'));
  assert.equal(result.error.line, 3);
  assert.equal(result.error.column, 5);
});
test('ClickHouse never reports unchecked INSERT payloads as validation success', async () => {
  for (const text of [
    'insert into t values (1);',
    'insert into t values broken_data;',
    "insert into t format JSONEachRow {\"id\":1}",
    'insert into t format JSONEachRow invalid_json',
    "insert into t from infile 'local.csv' format CSV;",
    'select 1; insert into t values (1); select 2;',
    'explain ast insert into t values (1);',
    'INSERT /* payload */ INTO t (id) VALUES (1);',
  ]) {
    const result = await run(text, 'validate', 'clickhouse');
    assert.equal(result.ok, false, text);
    assert.equal(result.kind, 'unsupported', JSON.stringify(result));
    assert.match(result.error.message, /검사 미지원/);
    assert.equal(result.error.offset, undefined);
  }
});
test('ClickHouse validation preserves numeric and string tokens without AST serialization', async () => {
  const text = "select 900719925474099312345, 1.2300, '한글; -- /* */', `MixedCase` from events;";
  const result = await run(text, 'validate', 'clickhouse');
  assert.deepEqual(result, { ok: true, text });
});

test('Oracle general SQL covers joins, CTE, analytic functions, MERGE, hierarchy, DML and DDL', async t => {
  const started = performance.now();
  for (const text of [SQL_SAMPLES.plsql,
    'select u.id from users u left join departments d on u.department = d.id where u.id in (select user_id from events);',
    'with totals as (select department, count(*) n from users group by department) select department, row_number() over (order by n desc) rn from totals;',
    'merge into target t using source s on (t.id = s.id) when matched then update set t.name = s.name when not matched then insert (id, name) values (s.id, s.name);',
    'select employee_id from employees start with manager_id is null connect by prior employee_id = manager_id;',
    'insert into t (id, name) values (1, :name); update t set name = :name where id = :id; delete from t where id = :id;',
    'create table t (id number primary key, name varchar2(20)); alter table t add created_at timestamp; drop table t;',
    "select q'[hello; ''world]', N'한글😀', 900719925474099312345, 1.2300 from dual;",
    'select 1 from dual;\n/\nselect 2 from dual;',
    "select 'begin; exec; create procedure;' from dual; -- PL/SQL words inside a literal",
  ]) {
    const result = await run(text, 'validate', 'plsql');
    assert.deepEqual(result, { ok: true, text });
  }
  t.diagnostic(`Oracle cold import + representative cases: ${(performance.now() - started).toFixed(1)} ms (Node)`);
});
test('Oracle lexer/parser errors cannot be recovered into success or ignore trailing input', async () => {
  for (const text of ['select * from;', 'select from dual;', 'select (1 from dual;', "select 'unfinished from dual;",
    'select § from dual;', 'select 1 from dual; select * from;', 'select 1 from dual; )',
    'select 1 from dual; /* unterminated', 'create table t (id number,);', 'update t set where id = 1;']) {
    const result = await run(text, 'validate', 'plsql');
    assert.equal(result.ok, false, text);
    assert.notEqual(result.kind, 'unsupported', text);
    assert.ok(result.error.offset >= 0 && result.error.offset <= text.length, JSON.stringify(result));
  }
});
test('Oracle translates code-point errors to original UTF-16 offsets with LF/CRLF, BOM and Unicode', async () => {
  for (const newline of ['\n', '\r\n']) {
    for (const bom of ['', '\uFEFF']) {
      for (const sql of ['select § from dual;', "select '한글😀', § from dual;"]) {
        const lexical = `${bom}-- 한글😀${newline}${sql}`;
        const lexerResult = await run(lexical, 'validate', 'plsql');
        assert.equal(lexerResult.ok, false);
        assert.deepEqual({ offset: lexerResult.error.offset, line: lexerResult.error.line, column: lexerResult.error.column },
          { offset: lexical.indexOf('§'), line: 2, column: sql.indexOf('§') + 1 }, JSON.stringify(lexical));
        assert.equal(lexical[lexerResult.error.offset], '§');
      }
      const syntactic = `${bom}-- 한글😀${newline}select * from dual${newline}where id = ;`;
      const parserResult = await run(syntactic, 'validate', 'plsql');
      assert.equal(parserResult.ok, false);
      assert.deepEqual({ offset: parserResult.error.offset, line: parserResult.error.line, column: parserResult.error.column },
        { offset: syntactic.indexOf('='), line: 3, column: 10 }, JSON.stringify(syntactic));
    }
  }
});
test('Oracle procedural bodies, SQL*Plus and implicit/explicit calls are unsupported, never normal', async () => {
  for (const text of ['begin null; end;', 'declare n number; begin n := 1; end;',
    'create or replace procedure p as begin null; end;',
    'create or replace function f return number as begin return 1; end;',
    'create or replace package p as procedure f; end;',
    'set serveroutput on', 'prompt hello', 'exec p;', 'call p();',
    'select 1 from dual; garbage', 'select 1 from dual; begin null; end;',
    'with function f return number is begin return 1; end; select f() from dual;',
  ]) {
    const result = await run(text, 'validate', 'plsql');
    assert.equal(result.ok, false, text);
    assert.equal(result.kind, 'unsupported', `${text}: ${JSON.stringify(result)}`);
    assert.match(result.error.message, /검사 미지원/);
  }
});
test('Oracle handles a representative multi-statement script without retaining parse trees', async t => {
  const text = 'select :id as id from dual;\n'.repeat(250);
  const started = performance.now();
  assert.deepEqual(await run(text, 'validate', 'plsql'), { ok: true, text });
  t.diagnostic(`Oracle 250 statements (${text.length} chars): ${(performance.now() - started).toFixed(1)} ms (Node; not a 10 MiB guarantee)`);
});
