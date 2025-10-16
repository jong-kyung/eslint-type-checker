import ts from "typescript";
import path from "path";
import { describeDeclaration, type DeclarationShape, type PropertyShape } from "./shape";

export type DeclarationInfo = {
  symbol: ts.Symbol;
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
  sourceFile: ts.SourceFile;
  shape: DeclarationShape;
};

export type ProgramState = {
  byCanonical: Map<string, DeclarationInfo[]>;
  byNode: Map<ts.Node, DeclarationInfo>;
  interfaceInfos: DeclarationInfo[];
  checker: ts.TypeChecker;
};

const programStateCache = new WeakMap<ts.Program, ProgramState>();

export function getProgramState(program: ts.Program): ProgramState {
  const cached = programStateCache.get(program);
  if (cached) return cached;

  const checker = program.getTypeChecker();
  const byCanonical = new Map<string, DeclarationInfo[]>();
  const byNode = new Map<ts.Node, DeclarationInfo>();
  const interfaceInfos: DeclarationInfo[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (shouldSkipSourceFile(sourceFile)) continue;
    sourceFile.forEachChild(function visit(node): void {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        if (!node.name) return;
        const symbol = checker.getSymbolAtLocation(node.name);
        if (!symbol) return;
        const shape = describeDeclaration(symbol, { checker });
        if (!shape) return;
        const info: DeclarationInfo = { symbol, node, sourceFile, shape };
        byNode.set(node, info);

        if (shape.kind === "object") {
          const list = byCanonical.get(shape.canonical);
          if (list) {
            list.push(info);
          } else {
            byCanonical.set(shape.canonical, [info]);
          }
        }

        if (ts.isInterfaceDeclaration(node)) {
          interfaceInfos.push(info);
        }
      }

      node.forEachChild(visit);
    });
  }

  for (const list of byCanonical.values()) {
    list.sort(compareDeclarationInfo);
  }

  interfaceInfos.sort(compareDeclarationInfo);

  const state: ProgramState = { byCanonical, byNode, interfaceInfos, checker };
  programStateCache.set(program, state);
  return state;
}

function compareDeclarationInfo(a: DeclarationInfo, b: DeclarationInfo): number {
  const fileA = normalizePath(a.sourceFile.fileName);
  const fileB = normalizePath(b.sourceFile.fileName);
  if (fileA !== fileB) {
    return fileA.localeCompare(fileB);
  }
  return a.node.pos - b.node.pos;
}

function shouldSkipSourceFile(sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile) return true;
  const fileName = normalizePath(sourceFile.fileName);
  return fileName.includes("/node_modules/");
}

function normalizePath(file: string): string {
  return file.split(path.sep).join("/");
}

export function findBestInterfaceBase(
  target: DeclarationInfo,
  interfaceInfos: DeclarationInfo[]
): DeclarationInfo | null {
  const targetShape = target.shape;
  if (targetShape.kind !== "object") return null;
  const targetProps = targetShape.properties;
  if (!targetProps.length) return null;

  let best: DeclarationInfo | null = null;

  for (const candidate of interfaceInfos) {
    if (candidate.symbol === target.symbol) continue;
    const candidateShape = candidate.shape;
    if (candidateShape.kind !== "object") continue;
    const candidateProps = candidateShape.properties;
    if (!candidateProps.length) continue;
    if (candidateProps.length >= targetProps.length) continue;

    if (!isSubset(candidateProps, targetProps)) continue;

    if (!best) {
      best = candidate;
      continue;
    }

    if (best.shape.kind !== "object") {
      best = candidate;
      continue;
    }

    if (candidateProps.length > best.shape.properties.length) {
      best = candidate;
      continue;
    }

    if (candidateProps.length === best.shape.properties.length && compareDeclarationInfo(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

function isSubset(base: PropertyShape[], derived: PropertyShape[]): boolean {
  return base.every((prop) =>
    derived.some(
      (candidate) =>
        candidate.name === prop.name &&
        candidate.optional === prop.optional &&
        candidate.readonly === prop.readonly &&
        candidate.typeKey === prop.typeKey
    )
  );
}
