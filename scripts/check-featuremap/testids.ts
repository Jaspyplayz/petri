import ts from "typescript";

type Location = { readonly file: string; readonly line: number };

export type TestIdUse =
  | (Location & { readonly kind: "exact"; readonly value: string })
  | (Location & { readonly kind: "pattern"; readonly text: string; readonly pattern: RegExp })
  | (Location & { readonly kind: "computed"; readonly text: string });

const ATTRIBUTE = "data-testid";

export function isRenderedSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.(test|e2e|spec)\.tsx?$/.test(path) && !path.split("/").includes("tests");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function usesOf(expression: ts.Expression, source: ts.SourceFile, file: string): TestIdUse[] {
  const node = unwrap(expression);
  const location = { file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ ...location, kind: "exact", value: node.text }];
  if (ts.isConditionalExpression(node)) return [...usesOf(node.whenTrue, source, file), ...usesOf(node.whenFalse, source, file)];
  if (ts.isTemplateExpression(node)) {
    const body = [escapeRegExp(node.head.text), ...node.templateSpans.map((span) => `.+${escapeRegExp(span.literal.text)}`)].join("");
    return [{ ...location, kind: "pattern", text: node.getText(source), pattern: new RegExp(`^${body}$`) }];
  }
  return [{ ...location, kind: "computed", text: node.getText(source) }];
}

function attributeName(name: ts.JsxAttributeName | ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

export function testIdsInSource(file: string, text: string): TestIdUse[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found: TestIdUse[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && attributeName(node.name) === ATTRIBUTE) {
      const initializer = node.initializer;
      if (initializer !== undefined && ts.isStringLiteral(initializer)) {
        found.push(...usesOf(initializer, source, file));
      } else if (initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
        found.push(...usesOf(initializer.expression, source, file));
      } else {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push({ file, line, kind: "computed", text: node.getText(source) });
      }
    } else if (ts.isPropertyAssignment(node) && attributeName(node.name) === ATTRIBUTE) {
      found.push(...usesOf(node.initializer, source, file));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
