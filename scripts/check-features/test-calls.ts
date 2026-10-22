import ts from "typescript";

const TEST_FUNCTIONS = new Set(["test", "it"]);
const TABLE_MODIFIERS = new Set(["each", "for"]);

export const isVitest = (specifier: string): boolean => specifier === "vitest";
export const isE2eFixture = (specifier: string): boolean => /^(@\/|(\.\.\/)+)shared\/testing\/e2e-fixture(\.ts)?$/.test(specifier);

function importedTestNames(file: ts.SourceFile, fromModule: (specifier: string) => boolean): Set<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    const typeOnly = clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
    if (!fromModule(statement.moduleSpecifier.text) || typeOnly || !bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && TEST_FUNCTIONS.has((element.propertyName ?? element.name).text)) names.add(element.name.text);
    }
  }
  return names;
}

function callsTestFunction(callee: ts.Expression, names: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(callee)) return names.has(callee.text);
  return (
    ts.isCallExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    ts.isIdentifier(callee.expression.expression) &&
    names.has(callee.expression.expression.text) &&
    TABLE_MODIFIERS.has(callee.expression.name.text)
  );
}

export function declaresATest(source: string, fromModule: (specifier: string) => boolean): boolean {
  const file = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const names = importedTestNames(file, fromModule);
  const declares = (node: ts.Node): boolean =>
    (ts.isCallExpression(node) &&
      callsTestFunction(node.expression, names) &&
      node.arguments.some((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))) ||
    (ts.forEachChild(node, (child) => (declares(child) ? true : undefined)) ?? false);
  return names.size > 0 && declares(file);
}
