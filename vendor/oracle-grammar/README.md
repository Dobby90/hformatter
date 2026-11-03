# Oracle grammar source

Source: https://github.com/antlr/grammars-v4/tree/89fd36482e8cb68a4e55df021a8adbc7541b52f2/sql/plsql
Pinned commit: 89fd36482e8cb68a4e55df021a8adbc7541b52f2
License: Apache-2.0 (see the grammar headers and public/licenses/oracle-grammar-LICENSE.txt).
The grammar is community-maintained, not Oracle's database parser. Its header refers to PL/SQL 11g; later syntax has been added, but full version compatibility is not guaranteed.

The four files in this directory are unmodified upstream sources. Generated JavaScript is checked in under src/formatters/sql/oracle/generated; its two base classes remove unused circular imports. No grammar rules are changed. SQL validation limits PL/SQL and SQL*Plus commands separately in the adapter.

Regenerate with Java and the official ANTLR 4.13.2 tool (https://www.antlr.org/download/antlr-4.13.2-complete.jar):

```sh
node scripts/generate-oracle-parser.mjs /path/to/antlr-4.13.2-complete.jar
```

Normal builds and deployment need neither Java nor a grammar download. Keep the generated parser and antlr4 runtime versions aligned.
