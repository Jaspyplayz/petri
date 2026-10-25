const LICENSE_HEADER = /@license|SPDX-License-Identifier/;

/** @type {import("eslint").Rule.RuleModule} */
const noComments = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow comments in application code. Names and the feature README carry the meaning." },
    schema: [],
    messages: {
      noComment:
        "No comments in src/. Rename things so the code explains itself, and put behaviour notes in the feature README.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        sourceCode.getAllComments().forEach((comment, index) => {
          const isLicenseHeader =
            index === 0 &&
            comment.type === "Block" &&
            LICENSE_HEADER.test(comment.value) &&
            comment.range !== undefined &&
            sourceCode.text.slice(0, comment.range[0]).trim() === "";
          if (!isLicenseHeader && comment.loc) {
            context.report({ loc: comment.loc, messageId: "noComment" });
          }
        });
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const serverOnlyFirst = {
  meta: {
    type: "problem",
    docs: { description: 'Server-only modules must start with `import "server-only"`.' },
    schema: [],
    messages: {
      missing:
        'Server-only module: make `import "server-only";` the first statement so it can never be bundled for the browser.',
    },
  },
  create(context) {
    return {
      Program(program) {
        const statements = program.body.filter(
          (statement) => !(statement.type === "ExpressionStatement" && "directive" in statement),
        );
        const first = statements[0];
        const startsWithServerOnly =
          first?.type === "ImportDeclaration" && first.source.value === "server-only" && first.specifiers.length === 0;
        if (!startsWithServerOnly) {
          context.report({ node: first ?? program, messageId: "missing" });
        }
      },
    };
  },
};

const STRING_ARRAY_REFERENCES = new Set(["Array", "ReadonlyArray"]);

function isStringArrayType(node) {
  if (node.type === "TSTypeOperator" && node.operator === "readonly" && node.typeAnnotation) {
    return isStringArrayType(node.typeAnnotation);
  }
  if (node.type === "TSArrayType") return node.elementType.type === "TSStringKeyword";
  if (node.type === "TSTypeReference" && node.typeName.type === "Identifier" && STRING_ARRAY_REFERENCES.has(node.typeName.name)) {
    const args = node.typeArguments?.params ?? [];
    return args.length === 1 && args[0].type === "TSStringKeyword";
  }
  return false;
}

function isSearchParamValueType(node) {
  if (node?.type !== "TSUnionType") return false;
  return (
    node.types.some((member) => member.type === "TSStringKeyword") &&
    node.types.some((member) => member.type === "TSUndefinedKeyword") &&
    node.types.some(isStringArrayType)
  );
}

function readsSearchParams(param) {
  const target = param.type === "AssignmentPattern" ? param.left : param;
  if (target.type === "Identifier") {
    return target.name === "searchParams" || isSearchParamValueType(target.typeAnnotation?.typeAnnotation);
  }
  if (target.type === "ObjectPattern") {
    return target.properties.some(
      (property) => property.type === "Property" && property.key.type === "Identifier" && property.key.name === "searchParams",
    );
  }
  return false;
}

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/** @type {import("eslint").Rule.RuleModule} */
const urlInputNeverThrows = {
  meta: {
    type: "problem",
    docs: { description: "Code that reads URL search parameters falls back to a default instead of throwing." },
    schema: [],
    messages: {
      throws:
        "This function reads a URL search parameter, which any visitor can set to anything. Fall back to a default (no filter, the default sort) instead of throwing: a throw here breaks the page for that URL and raises an unhandled error.",
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        const readsUrl = context.sourceCode
          .getAncestors(node)
          .some((ancestor) => FUNCTION_TYPES.has(ancestor.type) && ancestor.params.some(readsSearchParams));
        if (readsUrl) context.report({ node, messageId: "throws" });
      },
    };
  },
};

export const petriPlugin = {
  meta: { name: "petri" },
  rules: {
    "no-comments": noComments,
    "server-only-first": serverOnlyFirst,
    "url-input-never-throws": urlInputNeverThrows,
  },
};
