import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import { getProgramState, findBestInterfaceBase } from "../utils/declarations";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/jong-kyung/eslint-type-checker/blob/main/docs/rules/${name}.md`
);

type Options = [];
type MessageIds = "preferExtension" | "missingTypeInformation";

export default createRule<Options, MessageIds>({
  name: "prefer-interface-extension",
  meta: {
    type: "suggestion",
    docs: {
      description: "Require extending an existing interface when redeclaring all of its members in a new interface.",
      url: "https://github.com/jong-kyung/eslint-type-checker/blob/main/docs/rules/prefer-interface-extension.md",
    },
    schema: [],
    messages: {
      preferExtension:
        "Interface '{{name}}' redeclares all members from '{{base}}'. Extend the existing interface instead: `interface {{name}} extends {{base}} { … }`.",
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

    const state = getProgramState(parserServices.program);
    const nodeMap = parserServices.esTreeNodeToTSNodeMap;

    return {
      TSInterfaceDeclaration(node) {
        if (!node.id) return;
        if (node.extends?.length) return;
        if (!node.body.body.length) return;

        const tsNode = nodeMap.get(node as never);
        const info = state.byNode.get(tsNode);
        if (!info || info.shape.kind !== "object") return;
        if (!info.shape.properties.length) return;

        const candidate = findBestInterfaceBase(info, state.interfaceInfos);
        if (!candidate) return;

        context.report({
          node,
          messageId: "preferExtension",
          data: {
            name: info.symbol.getName(),
            base: candidate.symbol.getName(),
          },
        });
      },
    };
  },
});
