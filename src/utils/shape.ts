import ts from "typescript";

export type CanonicalizeOptions = {
  checker: ts.TypeChecker;
  depthLimit?: number;
  normalizeAlias?: boolean;
};

export type PropertyShape = {
  name: string;
  optional: boolean;
  readonly: boolean;
  typeKey: string;
};

export type DeclarationShape =
  | { kind: "object"; canonical: string; properties: PropertyShape[] }
  | { kind: "other"; canonical: string };

export function canonicalizeDeclarationSymbol(symbol: ts.Symbol, options: CanonicalizeOptions): string {
  const shape = describeDeclaration(symbol, options);
  return shape?.canonical ?? "";
}

export function describeDeclaration(
  symbol: ts.Symbol,
  { checker, depthLimit = 8, normalizeAlias = true }: CanonicalizeOptions
): DeclarationShape | null {
  const decl = symbol.getDeclarations()?.[0];
  if (!decl) return null;

  const type = checker.getTypeAtLocation(decl);
  const canonical = canonicalizeType(type, { checker, depthLimit, normalizeAlias, fallbackNode: decl });
  const properties = collectProperties(type, {
    checker,
    depthLimit: depthLimit - 1,
    normalizeAlias,
    fallbackNode: decl,
  });

  if (properties.length) {
    return {
      kind: "object",
      canonical,
      properties,
    };
  }

  return { kind: "other", canonical };
}

type InternalOptions = CanonicalizeOptions & { fallbackNode: ts.Node };

export function canonicalizeType(
  type: ts.Type,
  { checker, depthLimit = 8, normalizeAlias = true, fallbackNode }: InternalOptions
): string {
  const memo = new WeakMap<ts.Type, string>();

  const visit = (current: ts.Type, depth: number): string => {
    if (depth <= 0) {
      return "#DepthLimit";
    }

    const cached = memo.get(current);
    if (cached) return cached;

    let next = current;
    if (normalizeAlias && (current.aliasSymbol || current.aliasTypeArguments)) {
      const apparent = checker.getApparentType(current);
      if (apparent !== current) {
        next = apparent;
      }
    }

    let result: string;

    if (next.isUnion()) {
      const parts = next.types.map((t) => visit(t, depth - 1)).sort();
      result = `union<${parts.join("|")}>`;
    } else if (next.isIntersection()) {
      const parts = next.types.map((t) => visit(t, depth - 1)).sort();
      result = `intersection<${parts.join("&")}>`;
    } else if (checker.getIndexInfoOfType(next as ts.ObjectType, ts.IndexKind.String)) {
      const stringIndex = checker.getIndexInfoOfType(next as ts.ObjectType, ts.IndexKind.String);
      const numberIndex = checker.getIndexInfoOfType(next as ts.ObjectType, ts.IndexKind.Number);
      const stringType = stringIndex?.type;
      const numberType = numberIndex?.type;
      const stringKey = stringType ? visit(stringType, depth - 1) : "";
      const numberKey = numberType ? visit(numberType, depth - 1) : "";
      const props = canonicalizeObject(next, depth - 1);
      result = `object[string:${stringKey};number:${numberKey}]${props}`;
    } else if (next.getProperties().length) {
      result = `object${canonicalizeObject(next, depth - 1)}`;
    } else if (next.getCallSignatures().length || next.getConstructSignatures().length) {
      const calls = next
        .getCallSignatures()
        .map((sig) => checker.signatureToString(sig, undefined, ts.TypeFormatFlags.NoTruncation).trim())
        .sort();
      const constructs = next
        .getConstructSignatures()
        .map((sig) => checker.signatureToString(sig, undefined, ts.TypeFormatFlags.NoTruncation).trim())
        .sort();
      result = `callable<${calls.join(";")}|${constructs.join(";")}>`;
    } else {
      result = checker.typeToString(next, fallbackNode, ts.TypeFormatFlags.NoTruncation);
    }

    memo.set(current, result);
    return result;
  };

  const canonicalizeObject = (objectType: ts.Type, depth: number): string => {
    const props = collectProperties(objectType, {
      checker,
      depthLimit: depth,
      normalizeAlias,
      fallbackNode,
    });
    const entries = props.map((prop) => {
      const optional = prop.optional ? "?" : "";
      const readonly = prop.readonly ? "readonly " : "";
      return `${readonly}${prop.name}${optional}:${prop.typeKey}`;
    });
    return `{${entries.join(",")}}`;
  };

  return visit(type, depthLimit);
}

function collectProperties(
  type: ts.Type,
  { checker, depthLimit = 7, normalizeAlias = true, fallbackNode }: InternalOptions
): PropertyShape[] {
  if (depthLimit <= 0) return [];
  const props = type.getProperties();
  if (!props.length) return [];

  return props
    .map<PropertyShape | null>((prop) => {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0] ?? fallbackNode;
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
      const typeKey = canonicalizeType(propType, {
        checker,
        depthLimit: depthLimit - 1,
        normalizeAlias,
        fallbackNode: decl,
      });
      const optional = !!(prop.getFlags() & ts.SymbolFlags.Optional);
      const readonly = isReadonly(prop);

      return {
        name: prop.getName(),
        optional,
        readonly,
        typeKey,
      };
    })
    .filter((p): p is PropertyShape => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isReadonly(symbol: ts.Symbol): boolean {
  return (
    symbol.getDeclarations()?.some((decl) => {
      const modifiers = ts.canHaveModifiers(decl) ? ts.getModifiers(decl) : undefined;
      if (!modifiers?.length) return false;
      return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
    }) ?? false
  );
}
