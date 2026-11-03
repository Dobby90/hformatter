import { Parser, ParserRuleContext } from 'antlr4';
export default class PlSqlParser extends Parser {
  static RULE_call_statement: number;
  static RULE_plsql_unit: number;
  static RULE_sql_plus_command: number;
  static RULE_function_body: number;
  static RULE_procedure_body: number;
  sql_script(): ParserRuleContext;
}
