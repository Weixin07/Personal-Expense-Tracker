import { type Linter, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

import rule from '../../../scripts/eslint-rules/noDynamicSql.js';

/**
 * `RuleTester` emits its own `describe` blocks, so it has to run at the top
 * level of the file rather than inside one.
 */
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser as Linter.Parser },
});

ruleTester.run('local/no-dynamic-sql', rule, {
  valid: [
    "db.executeSql('SELECT * FROM t WHERE id = ?', [id]);",
    'db.executeSql(`SELECT * FROM t WHERE id = ?`, [id]);',
    "const sql = 'SELECT * FROM t WHERE id = ?'; db.executeSql(sql, [id]);",
    'const sql = `SELECT * FROM t WHERE id = ?`; db.executeSql(sql, [id]);',
    'logger.debug(`ran ${query}`);',
    "function read() { const sql = 'SELECT 1'; return db.executeSql(sql, []); }",

    'const build = () => `SELECT id FROM t WHERE id = ?`; db.executeSql(build(), [id]);',
    'function build() { return `SELECT id FROM t WHERE id = ?`; } db.executeSql(build(), [id]);',
    'function build(): string { return build(); } db.executeSql(build());',
    'const build = () => { const inner = () => `SELECT ${columns}`; return `SELECT id FROM t`; }; db.executeSql(build(), []);',

    // Accepted limits: the rule resolves within a file, so SQL arriving as a
    // parameter, imported from another module, or read off an object the rule
    // cannot resolve passes unreported.
    'const run = (sql: string) => db.executeSql(sql); run(`SELECT ${columns}`);',
    'db.transaction(tx => { statements.forEach(s => tx.executeSql(s.sql, [])); });',
    "import { QUERY } from './queries'; db.executeSql(QUERY);",
    'db.executeSql(builders.build());',
    "import { build } from './queries'; db.executeSql(build());",
  ],

  invalid: [
    {
      code: 'db.executeSql(`SELECT * FROM t WHERE id = ${userInput}`);',
      errors: [{ messageId: 'dynamicSql', column: 15 }],
    },
    {
      code: "db.executeSql('SELECT * FROM t WHERE id = ' + userInput);",
      errors: [{ messageId: 'dynamicSql', column: 15 }],
    },
    {
      code: 'const sql = `SELECT * FROM t WHERE id = ${userInput}`; db.executeSql(sql);',
      errors: [{ messageId: 'dynamicSql', column: 7 }],
    },
    {
      code: "let sql = 'SELECT * FROM t'; sql += userInput; db.executeSql(sql);",
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.executeSql(`SELECT ${userInput}` as string);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.executeSql(`SELECT ${userInput}` satisfies string);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.executeSql((`SELECT ${userInput}`)!);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: "db.executeSql(flag ? `SELECT ${userInput}` : 'SELECT 1');",
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.executeSql(override ?? `SELECT ${userInput}`);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: "db.executeSql('SELECT * FROM t WHERE id = '.concat(userInput));",
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: "db.executeSql(['SELECT * FROM', table].join(' '));",
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.executeSql(String.raw`SELECT ${userInput}`);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: "db['executeSql'](`SELECT ${userInput}`);",
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const { executeSql } = db; executeSql(`SELECT ${userInput}`);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db?.executeSql(`SELECT ${userInput}`);',
      errors: [{ messageId: 'dynamicSql', column: 16 }],
    },
    {
      code: 'this.db.executeSql(`SELECT ${userInput}`);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'if (flag) { const sql = `SELECT ${userInput}`; db.executeSql(sql); }',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const base = `SELECT ${userInput}`; const sql = base; db.executeSql(sql);',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'db.transaction(tx => { const sql = `SELECT ${userInput}`; tx.executeSql(sql); });',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const build = () => `SELECT ${columns} FROM t`; db.executeSql(build());',
      errors: [{ messageId: 'dynamicSql', column: 21 }],
    },
    {
      code: 'const build = () => { return `SELECT ${columns} FROM t`; }; db.executeSql(build());',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'function build() { return `SELECT ${columns} FROM t`; } db.executeSql(build());',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const build = function () { return `SELECT ${columns} FROM t`; }; db.executeSql(build());',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const build = (cols: string) => `SELECT ${cols} FROM t`; db.executeSql(build(COLUMNS));',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'function build(all: boolean) { if (all) { return `SELECT id FROM t`; } return `SELECT ${columns} FROM t`; } db.executeSql(build(false));',
      errors: [{ messageId: 'dynamicSql' }],
    },
    {
      code: 'const build = () => { const sql = `SELECT ${columns} FROM t`; return sql; }; db.executeSql(build());',
      errors: [{ messageId: 'dynamicSql' }],
    },
  ],
});
