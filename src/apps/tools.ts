import { APP_BY_ID, OP_BY_ID, runOp, type OpDef } from './registry'
import type { Toolset } from '../ai/mcp'
import type { ToolDef } from '../ai/types'
import type { Settings } from '../types'

/** `github.push` → `app__github_push`, inside the 64-character tool-name limit. */
export const toolName = (opId: string) => `app__${opId.replace(/[^a-zA-Z0-9]+/g, '_')}`

function schemaOf(op: OpDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of op.params) {
    if (p.type === 'files') {
      properties[p.key] = {
        type: 'array',
        description: 'Files to write, each with a relative path and its full text content.',
        items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      }
    } else if (p.type === 'bool') {
      properties[p.key] = { type: 'boolean', description: p.label }
    } else {
      properties[p.key] = { type: 'string', description: [p.label, p.help, p.placeholder && `e.g. ${p.placeholder}`].filter(Boolean).join('. ') }
    }
    if (!p.optional && p.type !== 'bool') required.push(p.key)
  }
  return { type: 'object', properties, required }
}

/**
 * Offers connected-app actions to a model as tools. Only apps that are
 * actually connected are offered; the rest come back as warnings so the user
 * knows why a tool is missing.
 */
export function buildAppToolset(opIds: string[], settings: Settings, signal: AbortSignal): Toolset {
  const tools: ToolDef[] = []
  const route = new Map<string, OpDef>()
  const warnings: string[] = []
  for (const id of opIds) {
    const op = OP_BY_ID[id]
    if (!op) continue
    // Actions that publish a generated file need a run to take it from, so
    // they are Action stages only, never something a model calls mid-answer.
    if (op.params.some(p => p.type === 'media')) {
      warnings.push(`“${op.name}” needs a file from an earlier stage, so it works as an Action stage rather than a tool.`)
      continue
    }
    const app = APP_BY_ID[op.app]
    if (!app.ready(settings.apps[op.app])) {
      warnings.push(`${app.name} is not connected, so “${op.name}” was not offered to the model.`)
      continue
    }
    const name = toolName(id)
    route.set(name, op)
    tools.push({ name, description: `[${app.name}] ${op.summary}`, parameters: schemaOf(op) })
  }
  return {
    tools,
    warnings,
    async call(name, args) {
      const op = route.get(name)
      if (!op) return { result: `Unknown tool ${name}.`, server: 'Apps', tool: name }
      let params: Record<string, unknown>
      try {
        params = args ? JSON.parse(args) : {}
      } catch {
        return { result: 'Tool arguments were not valid JSON.', server: APP_BY_ID[op.app].name, tool: op.name }
      }
      try {
        const r = await runOp(op.id, params, settings.apps[op.app], {}, signal)
        const links = r.links?.map(l => `${l.label}: ${l.url}`).join('\n')
        return { result: links ? `${r.text}\n${links}` : r.text, server: APP_BY_ID[op.app].name, tool: op.name }
      } catch (e) {
        return { result: `Failed: ${e instanceof Error ? e.message : String(e)}`, server: APP_BY_ID[op.app].name, tool: op.name }
      }
    },
  }
}

export function mergeToolsets(a: Toolset, b: Toolset): Toolset {
  const names = new Set(b.tools.map(t => t.name))
  return {
    tools: [...a.tools.filter(t => !names.has(t.name)), ...b.tools],
    warnings: [...a.warnings, ...b.warnings],
    call: (name, args) => (names.has(name) ? b.call(name, args) : a.call(name, args)),
  }
}
