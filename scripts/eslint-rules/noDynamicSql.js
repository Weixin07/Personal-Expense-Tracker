'use strict';

/**
 * Forbids SQL built by interpolation or concatenation from reaching
 * `executeSql`, whether written at the call site, assembled in a variable
 * first, or returned by a helper declared in the same file. Reports only what
 * it can prove dynamic within one file: a query imported from another module,
 * arriving as a parameter, or read off an object the rule cannot resolve
 * passes unreported. A report lands on the interpolated argument, or on the
 * declaration or returned expression the argument resolved to, which is where
 * a suppression for it belongs.
 */

const SQL_METHODS = new Set(['executeSql']);

const MAX_DEPTH = 6;

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
]);

const unwrap = node => {
  let current = node;
  while (current && TYPE_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
};

const isStaticString = node =>
  !!node &&
  (node.type === 'Literal' ||
    (node.type === 'TemplateLiteral' && node.expressions.length === 0));

const memberName = expression =>
  expression.computed
    ? expression.property.type === 'Literal'
      ? expression.property.value
      : null
    : expression.property.type === 'Identifier'
      ? expression.property.name
      : null;

const returnedExpressions = fn => {
  if (!fn || !fn.body) {
    return [];
  }
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }

  const found = [];
  const stack = [fn.body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node !== fn.body && FUNCTION_TYPES.has(node.type)) {
      continue;
    }
    if (node.type === 'ReturnStatement') {
      if (node.argument) {
        found.push(node.argument);
      }
      continue;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') {
        continue;
      }
      const value = node[key];
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child.type === 'string') {
          stack.push(child);
        }
      }
    }
  }
  return found;
};

const resolveVariable = (sourceCode, identifier) => {
  const reference = sourceCode
    .getScope(identifier)
    .references.find(candidate => candidate.identifier === identifier);
  return reference ? reference.resolved : null;
};

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require parameterised queries rather than interpolated or concatenated SQL in executeSql calls',
    },
    schema: [],
    messages: {
      dynamicSql:
        'Use parameterised queries with placeholder bindings when calling executeSql.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const visited = new Set();

    const isDynamic = (node, depth) => {
      const current = unwrap(node);
      if (!current || depth > MAX_DEPTH) {
        return false;
      }

      switch (current.type) {
        case 'TemplateLiteral':
          return current.expressions.length > 0;
        case 'TaggedTemplateExpression':
          return current.quasi.expressions.length > 0;
        case 'BinaryExpression':
          return (
            current.operator === '+' &&
            (!isStaticString(unwrap(current.left)) ||
              !isStaticString(unwrap(current.right)))
          );
        case 'ConditionalExpression':
          return (
            isDynamic(current.consequent, depth + 1) ||
            isDynamic(current.alternate, depth + 1)
          );
        case 'LogicalExpression':
          return (
            isDynamic(current.left, depth + 1) ||
            isDynamic(current.right, depth + 1)
          );
        case 'CallExpression':
          return isDynamicCall(current, depth);
        case 'Identifier':
          return isDynamicVariable(current, depth);
        default:
          return false;
      }
    };

    const resolveCalleeFunction = call => {
      if (call.callee.type !== 'Identifier') {
        return null;
      }
      const variable = resolveVariable(sourceCode, call.callee);
      if (!variable) {
        return null;
      }
      for (const definition of variable.defs) {
        if (definition.node.type === 'FunctionDeclaration') {
          return definition.node;
        }
        if (
          definition.node.type === 'VariableDeclarator' &&
          definition.node.init &&
          FUNCTION_TYPES.has(definition.node.init.type)
        ) {
          return definition.node.init;
        }
      }
      return null;
    };

    const isDynamicCall = (call, depth) => {
      const fn = resolveCalleeFunction(call);
      if (fn) {
        if (visited.has(fn)) {
          return false;
        }
        visited.add(fn);
        return returnedExpressions(fn).some(expression =>
          isDynamic(expression, depth + 1),
        );
      }
      if (call.callee.type !== 'MemberExpression') {
        return false;
      }
      const name = memberName(call.callee);
      if (name === 'concat') {
        return (
          call.arguments.some(argument => !isStaticString(unwrap(argument))) ||
          isDynamic(call.callee.object, depth + 1)
        );
      }
      if (name === 'join' && call.callee.object.type === 'ArrayExpression') {
        return call.callee.object.elements.some(
          element => element && !isStaticString(unwrap(element)),
        );
      }
      return false;
    };

    const isDynamicVariable = (identifier, depth) => {
      if (visited.has(identifier)) {
        return false;
      }
      visited.add(identifier);

      const variable = resolveVariable(sourceCode, identifier);
      if (!variable) {
        return false;
      }

      const declaredDynamic = variable.defs.some(
        definition =>
          definition.node.type === 'VariableDeclarator' &&
          definition.node.init &&
          isDynamic(definition.node.init, depth + 1),
      );

      // Scope analysis reports the right-hand side alone for `q += x`, so the
      // concatenation is invisible unless the assignment operator is read from
      // the parent node.
      const assignedDynamic = variable.references.some(reference => {
        if (!reference.writeExpr) {
          return false;
        }
        const parent = reference.identifier.parent;
        const appendsNonLiteral =
          parent &&
          parent.type === 'AssignmentExpression' &&
          parent.operator !== '=' &&
          !isStaticString(unwrap(reference.writeExpr));
        return appendsNonLiteral || isDynamic(reference.writeExpr, depth + 1);
      });

      return declaredDynamic || assignedDynamic;
    };

    const callsSqlMethod = call => {
      if (call.callee.type === 'MemberExpression') {
        return SQL_METHODS.has(memberName(call.callee));
      }
      if (call.callee.type === 'Identifier') {
        const variable = resolveVariable(sourceCode, call.callee);
        return (
          !!variable &&
          variable.defs.some(
            definition =>
              definition.type === 'Variable' &&
              definition.node.id.type === 'ObjectPattern' &&
              definition.node.id.properties.some(
                property =>
                  property.key &&
                  property.key.type === 'Identifier' &&
                  SQL_METHODS.has(property.key.name),
              ),
          )
        );
      }
      return false;
    };

    const reportTarget = statement => {
      if (statement.type === 'Identifier') {
        const variable = resolveVariable(sourceCode, statement);
        const definition = variable && variable.defs[0];
        return definition && definition.node ? definition.node : statement;
      }
      if (statement.type === 'CallExpression') {
        const fn = resolveCalleeFunction(statement);
        const offending =
          fn &&
          returnedExpressions(fn).find(expression => {
            visited.clear();
            return isDynamic(expression, 0);
          });
        if (offending) {
          return offending;
        }
      }
      return statement;
    };

    return {
      CallExpression(node) {
        if (node.arguments.length === 0 || !callsSqlMethod(node)) {
          return;
        }
        const statement = node.arguments[0];
        visited.clear();
        if (!isDynamic(statement, 0)) {
          return;
        }
        visited.clear();
        context.report({
          node: reportTarget(unwrap(statement)),
          messageId: 'dynamicSql',
        });
      },
    };
  },
};

module.exports = rule;
