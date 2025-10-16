import path from "node:path";
import * as ts from "typescript";
import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import { getProgramState, type DeclarationInfo } from "../utils/declarations";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/jong-kyung/eslint-type-checker/blob/main/docs/rules/${name}.md`
);

type Options = [];
type MessageIds = "duplicateDeclaration" | "missingTypeInformation";

export default createRule<Options, MessageIds>({
  name: "no-duplicate-type-declaration",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow declaring a new interface or type alias when an identical object shape already exists.",
      url: "https://github.com/jong-kyung/eslint-type-checker/blob/main/docs/rules/no-duplicate-type-declaration.md",
    },
    schema: [],
    messages: {
      duplicateDeclaration:
        "This {{kind}} duplicates the shape of {{originalName}} declared in {{file}}. Reuse the existing declaration instead of creating a new one.",
      missingTypeInformation:
        "Type information is required. Configure parserOptions.project for @typescript-eslint/parser.",
    },
  },
  defaultOptions: [],
  create(context) {
    const parserServices = context.parserServices;
    if (!parserServices?.program || !parserServices.esTreeNodeToTSNodeMap) {
      return {
        Program(node: TSESTree.Program) {
          context.report({ node, messageId: "missingTypeInformation" });
        },
      };
    }

    const program = parserServices.program;
    const nodeMap = parserServices.esTreeNodeToTSNodeMap;
    const state = getProgramState(program);

    const handleInterface = (node: TSESTree.TSInterfaceDeclaration) => {
      if (node.extends?.length) return;
      reportDuplicate(node);
    };

    const handleTypeAlias = (node: TSESTree.TSTypeAliasDeclaration) => {
      if (node.typeAnnotation.type !== AST_NODE_TYPES.TSTypeLiteral) return;
      reportDuplicate(node);
    };

    function reportDuplicate(node: TSESTree.Node): void {
      const tsNode = nodeMap.get(node as never);
      const info = state.byNode.get(tsNode);
      if (!info || info.shape.kind !== "object") return;

      const sortedUnique = uniqueBySymbol(state.byCanonical.get(info.shape.canonical) ?? []);
      if (sortedUnique.length <= 1) return;

      const currentIndex = sortedUnique.findIndex((candidate) => candidate.symbol === info.symbol);
      if (currentIndex <= 0) return;

      const original = sortedUnique[0];
      const kind = ts.isInterfaceDeclaration(info.node) ? "interface" : "type";

      context.report({
        node,
        messageId: "duplicateDeclaration",
        data: {
          kind,
          originalName: original.symbol.getName(),
          file: toRelativePath(original.sourceFile.fileName),
        },
      });
    }

    return {
      TSInterfaceDeclaration: handleInterface,
      TSTypeAliasDeclaration: handleTypeAlias,
    };
  },
});

function uniqueBySymbol(infos: DeclarationInfo[]): DeclarationInfo[] {
  const seen = new Set<ts.Symbol>();
  const result: DeclarationInfo[] = [];
  for (const info of infos) {
    if (seen.has(info.symbol)) continue;
    seen.add(info.symbol);
    result.push(info);
  }
  return result;
}

function toRelativePath(fileName: string): string {
  const relative = path.relative(process.cwd(), fileName);
  if (!relative || relative.startsWith("..")) {
    return normalizeSeparators(fileName);
  }
  return normalizeSeparators(relative);
}

function normalizeSeparators(value: string): string {
  return value.split(path.sep).join("/");
}
