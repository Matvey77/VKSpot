import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const rootDir = resolve(__dirname, '../..')

function listSourceFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...listSourceFiles(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) results.push(full)
  }
  return results
}

function collectModuleSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const specifiers: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return specifiers
}

function extractTypeKeys(filePath: string, typeName: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const keys: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === typeName &&
      ts.isTypeLiteralNode(node.type)
    ) {
      for (const member of node.type.members) {
        if (ts.isPropertySignature(member)) {
          if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
            keys.push(member.name.text)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return keys
}

function extractFirstStringArgCalls(filePath: string, calleeName: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const channels: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === calleeName &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      channels.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return channels
}

describe('architecture and IPC boundary invariants', () => {
  it('forbids importing zod or shared/model in src/renderer/src', () => {
    const rendererFiles = listSourceFiles(join(rootDir, 'src/renderer/src'))
    expect(rendererFiles.length).toBeGreaterThan(0)
    const violations: string[] = []
    for (const filePath of rendererFiles) {
      for (const specifier of collectModuleSpecifiers(filePath)) {
        if (
          specifier === 'zod' ||
          specifier.startsWith('zod/') ||
          /(?:^|\/)shared\/model(?:\.ts)?$/.test(specifier)
        ) {
          violations.push(`${filePath}: ${specifier}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps IpcInvokeMap synchronized across shared/ipc, preload, and main register', () => {
    const ipcKeys = extractTypeKeys(join(rootDir, 'src/shared/ipc.ts'), 'IpcInvokeMap')
    expect(ipcKeys.length).toBeGreaterThan(0)

    const preloadChannels = extractFirstStringArgCalls(
      join(rootDir, 'src/preload/index.ts'),
      'invoke',
    )
    const mainChannels = extractFirstStringArgCalls(
      join(rootDir, 'src/main/ipc/register.ts'),
      'handler',
    )

    expect(new Set(preloadChannels)).toEqual(new Set(ipcKeys))
    expect(new Set(mainChannels)).toEqual(new Set(ipcKeys))

    const eventKeys = extractTypeKeys(join(rootDir, 'src/shared/ipc.ts'), 'IpcEventMap')
    const preloadEvents = extractFirstStringArgCalls(
      join(rootDir, 'src/preload/index.ts'),
      'subscribe',
    )
    expect(new Set(preloadEvents)).toEqual(new Set(eventKeys))
  })
})
