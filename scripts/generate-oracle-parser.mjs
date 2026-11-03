// Regenerate checked-in Oracle JS from the pinned grammar. Java is needed only here.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const jar = process.argv[2];
if (!jar) { console.error('Usage: node scripts/generate-oracle-parser.mjs /path/to/antlr-4.13.2-complete.jar'); process.exit(1); }
const grammar = resolve(root, 'vendor/oracle-grammar');
const out = resolve(root, 'src/formatters/sql/oracle/generated');
mkdirSync(out, { recursive: true });
const result = spawnSync('java', ['-jar', resolve(jar), '-Dlanguage=JavaScript', '-no-listener', '-no-visitor', '-Xexact-output-dir', '-o', out, 'PlSqlLexer.g4', 'PlSqlParser.g4'], { cwd: grammar, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const name of ['PlSqlLexerBase.js', 'PlSqlParserBase.js']) {
  // Upstream includes unused generated-class imports which create circular imports.
  const text = readFileSync(resolve(grammar, name), 'utf8').replace(/^import JavaScriptLexer .*\n/m, '');
  writeFileSync(resolve(out, name), '// Adapted from the pinned grammars-v4 source: removed unused circular import.\n' + text);
}
// Remove only the known tool outputs that are not runtime inputs.
for (const name of ['PlSqlLexer.interp', 'PlSqlLexer.tokens', 'PlSqlParser.interp', 'PlSqlParser.tokens']) unlinkSync(resolve(out, name));
console.log('Oracle parser generated with ANTLR 4.13.2. See vendor/oracle-grammar/README.md.');
