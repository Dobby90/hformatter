import { CharStreams, CommonTokenStream, ErrorListener, ParseTreeListener, Token } from 'antlr4';
import type { ParserRuleContext } from 'antlr4';
import PlSqlLexer from './generated/PlSqlLexer.js';
import PlSqlParser from './generated/PlSqlParser.js';

const UNSUPPORTED = '검사 미지원 · Oracle은 일반 SQL만 검사합니다. PL/SQL 블록·프로시저·함수·패키지·호출문 및 SQL*Plus 명령은 추후 지원 예정입니다.';
class UnsupportedOracleInput extends Error {}

// ANTLR indexes Unicode code points; CodeMirror uses UTF-16 code units.
function utf16Offset(text: string, codePoints: number): number {
  let offset = 0, count = 0;
  for (const character of text) {
    if (count++ >= codePoints) break;
    offset += character.length;
  }
  return offset;
}
function syntaxError(text: string, codePoints: number): Error {
  const offset = utf16Offset(text, Math.max(0, codePoints));
  const codePoint = text.codePointAt(offset);
  return Object.assign(new Error('Oracle 구문 분석 실패'), {
    location: { start: { offset } },
    found: codePoint === undefined ? null : String.fromCodePoint(codePoint),
  });
}
class ScopeListener extends ParseTreeListener {
  enterEveryRule(context: ParserRuleContext) {
    const index = (context as ParserRuleContext & { ruleIndex: number }).ruleIndex;
    if ([PlSqlParser.RULE_call_statement, PlSqlParser.RULE_plsql_unit, PlSqlParser.RULE_sql_plus_command,
      PlSqlParser.RULE_function_body, PlSqlParser.RULE_procedure_body].includes(index)) {
      throw new UnsupportedOracleInput(UNSUPPORTED);
    }
  }
  exitEveryRule() {}
  visitTerminal() {}
  visitErrorNode() {}
}
export function validateOracle(text: string): string | undefined {
  const characters = CharStreams.fromString(text, true);
  const lexer = new PlSqlLexer(characters);
  const lexerErrors = new ErrorListener<number>();
  lexerErrors.syntaxError = () => { throw syntaxError(text, lexer._tokenStartCharIndex); };
  lexer.removeErrorListeners(); lexer.addErrorListener(lexerErrors);
  const tokens = new CommonTokenStream(lexer);
  const parser = new PlSqlParser(tokens);
  const parserErrors = new ErrorListener<Token>();
  parserErrors.syntaxError = (_recognizer, token) => { throw syntaxError(text, token?.start ?? characters.index); };
  parser.removeErrorListeners(); parser.addErrorListener(parserErrors);
  // Fail on the first lexer/parser error rather than accepting recovered syntax.
  parser.buildParseTrees = false;
  parser.addParseListener(new ScopeListener());
  try {
    parser.sql_script(); // The pinned rule includes EOF: trailing input cannot be ignored.
    if (parser.getCurrentToken().type !== Token.EOF) throw syntaxError(text, parser.getCurrentToken().start);
  } catch (error) {
    if (error instanceof UnsupportedOracleInput) return error.message;
    throw error;
  }
}
