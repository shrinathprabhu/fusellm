import { readSse } from './sse'
import type { ToolDef } from './types'
import type { McpServer } from '../types'

/**
 * A Model Context Protocol client over Streamable HTTP, small enough to run
 * in a page. It covers what a model needs: initialize, list tools, call a
 * tool. Responses may come back as plain JSON or as an SSE stream, depending
 * on the server; both are handled.
 *
 * Only remote servers that allow browser (CORS) requests can work here, and
 * a server that wants the session header read back must expose it. Both
 * DeepWiki and Context7 do.
 */

const PROTOCOL = '2025-06-18'
const RESULT_LIMIT = 24_000

interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

class McpClient {
  private session?: string
  private next = 1
  private ready?: Promise<void>
  private tools?: { at: number; list: McpToolInfo[] }
  readonly server: McpServer

  constructor(server: McpServer) {
    this.server = server
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
    }
    if (this.server.token) h.authorization = `Bearer ${this.server.token}`
    if (this.server.headerName && this.server.headerValue) h[this.server.headerName] = this.server.headerValue
    if (this.session) h['mcp-session-id'] = this.session
    return h
  }

  private async rpc(method: string, params: unknown, signal?: AbortSignal, notify = false): Promise<any> {
    const id = notify ? undefined : this.next++
    const res = await fetch(this.server.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
      signal,
      credentials: 'omit',
    }).catch(() => {
      throw new Error(`Could not reach ${this.server.name}. The server may be down or may not allow browser requests.`)
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.session = sid
    if (notify) return
    if (res.status === 404 && this.session && method !== 'initialize') {
      // The server forgot our session; start a new one and try again once.
      this.session = undefined
      this.ready = undefined
      await this.init(signal)
      return this.rpc(method, params, signal)
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      if (res.status === 401) throw new Error(`${this.server.name} needs authentication (401). Add a token in Library → MCP.`)
      throw new Error(`${this.server.name} returned ${res.status}. ${t.slice(0, 200)}`)
    }
    const type = res.headers.get('content-type') ?? ''
    let msg: any
    if (type.includes('text/event-stream') && res.body) {
      for await (const ev of readSse(res.body, signal)) {
        try {
          const j = JSON.parse(ev.data)
          if (j.id === id) {
            msg = j
            break
          }
        } catch {
          /* skip keep-alives */
        }
      }
    } else {
      msg = await res.json().catch(() => null)
    }
    if (!msg) throw new Error(`${this.server.name} sent no reply to ${method}.`)
    if (msg.error) throw new Error(`${this.server.name}: ${msg.error.message ?? 'error'}`)
    return msg.result
  }

  init(signal?: AbortSignal): Promise<void> {
    this.ready ??= (async () => {
      await this.rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'FuseLLM', version: '1.0.0' } }, signal)
      await this.rpc('notifications/initialized', {}, signal, true).catch(() => {})
    })().catch(err => {
      this.ready = undefined
      throw err
    })
    return this.ready
  }

  async listTools(signal?: AbortSignal): Promise<McpToolInfo[]> {
    if (this.tools && Date.now() - this.tools.at < 5 * 60_000) return this.tools.list
    await this.init(signal)
    const list: McpToolInfo[] = []
    let cursor: string | undefined
    do {
      const r = await this.rpc('tools/list', cursor ? { cursor } : {}, signal)
      list.push(...(r?.tools ?? []))
      cursor = r?.nextCursor
    } while (cursor && list.length < 200)
    this.tools = { at: Date.now(), list }
    return list
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    await this.init(signal)
    const r = await this.rpc('tools/call', { name, arguments: args }, signal)
    const parts: string[] = []
    for (const c of r?.content ?? []) {
      if (c.type === 'text') parts.push(c.text)
      else if (c.type === 'resource' && c.resource?.text) parts.push(c.resource.text)
      else if (c.type === 'resource_link') parts.push(`${c.name ?? 'resource'}: ${c.uri}`)
      else if (c.type === 'image') parts.push('[image omitted]')
    }
    if (!parts.length && r?.structuredContent) parts.push(JSON.stringify(r.structuredContent))
    let out = parts.join('\n\n') || '(empty result)'
    if (out.length > RESULT_LIMIT) out = out.slice(0, RESULT_LIMIT) + `\n\n[truncated ${out.length - RESULT_LIMIT} characters]`
    return r?.isError ? `Tool error: ${out}` : out
  }
}

const clients = new Map<string, McpClient>()

function client(server: McpServer): McpClient {
  const key = `${server.id}|${server.url}|${server.token ?? ''}|${server.headerValue ?? ''}`
  let c = clients.get(key)
  if (!c) {
    c = new McpClient(server)
    clients.set(key, c)
  }
  return c
}

export interface Toolset {
  tools: ToolDef[]
  call: (name: string, args: string) => Promise<{ result: string; server: string; tool: string }>
  warnings: string[]
}

/**
 * Connects to each server and flattens their tools into one namespaced list,
 * `server__tool`, within the 64-character limit providers put on tool names.
 * A server that fails to connect is skipped with a warning, not fatal.
 */
export async function buildToolset(servers: McpServer[], signal?: AbortSignal): Promise<Toolset> {
  const route = new Map<string, { c: McpClient; tool: string }>()
  const tools: ToolDef[] = []
  const warnings: string[] = []
  await Promise.all(
    servers.map(async s => {
      try {
        const c = client(s)
        const list = await c.listTools(signal)
        const prefix = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'mcp'
        for (const t of list) {
          let name = `${prefix}__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
          while (route.has(name)) name = name.slice(0, 60) + '_' + route.size
          route.set(name, { c, tool: t.name })
          tools.push({
            name,
            description: `[${s.name}] ${t.description ?? t.name}`.slice(0, 1000),
            parameters: normaliseSchema(t.inputSchema),
          })
        }
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : String(err))
      }
    }),
  )
  return {
    tools,
    warnings,
    async call(name, args) {
      const r = route.get(name)
      if (!r) return { result: `Unknown tool ${name}.`, server: '?', tool: name }
      let parsed: Record<string, unknown> = {}
      try {
        parsed = args ? JSON.parse(args) : {}
      } catch {
        return { result: 'Tool arguments were not valid JSON.', server: r.c.server.name, tool: r.tool }
      }
      try {
        return { result: await r.c.call(r.tool, parsed, signal), server: r.c.server.name, tool: r.tool }
      } catch (err) {
        return { result: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, server: r.c.server.name, tool: r.tool }
      }
    },
  }
}

function normaliseSchema(s?: Record<string, unknown>): Record<string, unknown> {
  if (!s || s.type !== 'object') return { type: 'object', properties: {} }
  return { ...s, properties: s.properties ?? {} }
}

/** Used by the Library view's "Test connection" button. */
export async function probe(server: McpServer): Promise<{ ok: true; tools: string[] } | { ok: false; error: string }> {
  try {
    const list = await new McpClient(server).listTools()
    return { ok: true, tools: list.map(t => t.name) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
