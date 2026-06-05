import { Linter } from 'eslint';

// Mirrors the executeSql branch of `no-restricted-syntax` in eslint.config.mjs.
// Keep this selector in sync with that config: it is the guard against
// dynamically constructed SQL passed to executeSql.
const EXECUTE_SQL_SELECTOR =
  "CallExpression[callee.property.name='executeSql'] > :matches(TemplateLiteral[expressions.length > 0], BinaryExpression)";

const linter = new Linter({ configType: 'flat' });
const config: Linter.Config[] = [
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: EXECUTE_SQL_SELECTOR,
          message: 'dynamic SQL is disallowed',
        },
      ],
    },
  },
];

const lint = (code: string) => linter.verify(code, config);

describe('executeSql SQL-safety lint rule', () => {
  it('flags value interpolation in a template literal', () => {
    const messages = lint(
      'db.executeSql(`SELECT * FROM t WHERE id = ${userInput}`);',
    );
    expect(messages).toHaveLength(1);
  });

  it('flags string concatenation', () => {
    const messages = lint(
      "db.executeSql('SELECT * FROM t WHERE id = ' + userInput);",
    );
    expect(messages).toHaveLength(1);
  });

  it('allows a parameterised template literal with no expressions', () => {
    const messages = lint(
      'db.executeSql(`SELECT * FROM t WHERE id = ?`, [id]);',
    );
    expect(messages).toHaveLength(0);
  });

  it('allows a parameterised plain string', () => {
    const messages = lint(
      "db.executeSql('SELECT * FROM t WHERE id = ?', [id]);",
    );
    expect(messages).toHaveLength(0);
  });
});
