import ts from "typescript";

export type RegistryListing = {
  readonly ids: readonly string[];
  readonly problems: readonly string[];
};

const REGISTRY = "src/features/registry.ts";
const MANIFEST_IMPORT = /^\.\/([^/]+)\/feature\.manifest(?:\.ts)?$/;

function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function literalId(argument: ts.Expression | undefined): string | undefined {
  if (argument === undefined) return undefined;
  const object = unwrap(argument);
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== "id") continue;
    const value = unwrap(property.initializer);
    return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : undefined;
  }
  return undefined;
}

export function manifestIdsInSource(text: string): string[] {
  const ids: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineFeature") {
      ids.push(literalId(node.arguments[0]) ?? "<id is not a string literal>");
    }
    ts.forEachChild(node, visit);
  };
  visit(parse("feature.manifest.ts", text));
  return ids;
}

function manifestImports(source: ts.SourceFile): Map<string, string> {
  const folders = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const folder = MANIFEST_IMPORT.exec(statement.moduleSpecifier.text)?.[1];
    const bindings = statement.importClause?.namedBindings;
    if (folder === undefined || bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) folders.set(element.name.text, folder);
  }
  return folders;
}

function featureManifestsArray(source: ts.SourceFile): ts.ArrayLiteralExpression | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "featureManifests" || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (ts.isArrayLiteralExpression(initializer)) return initializer;
    }
  }
  return undefined;
}

export function registryIdsInSource(text: string): RegistryListing {
  const source = parse("registry.ts", text);
  const list = featureManifestsArray(source);
  if (!list) return { ids: [], problems: [`${REGISTRY}: must declare featureManifests as an array literal`] };
  const folders = manifestImports(source);
  const ids: string[] = [];
  const problems: string[] = [];
  list.elements.forEach((element, index) => {
    const folder = ts.isIdentifier(element) ? folders.get(element.text) : undefined;
    if (folder === undefined) {
      problems.push(`${REGISTRY}: featureManifests[${String(index)}] must be a manifest imported from ./<id>/feature.manifest`);
    } else {
      ids.push(folder);
    }
  });
  return { ids, problems };
}
