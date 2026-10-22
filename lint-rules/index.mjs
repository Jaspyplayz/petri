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

export const petriPlugin = {
  meta: { name: "petri" },
  rules: {
    "no-comments": noComments,
    "server-only-first": serverOnlyFirst,
  },
};
