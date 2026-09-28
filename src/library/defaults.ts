import type { Circuit, McpServer } from '../types.ts'
import { CLASSIC } from './circuits/classic.ts'
import { ENGINEERING } from './circuits/engineering.ts'
import { BUSINESS } from './circuits/business.ts'
import { KNOWLEDGE } from './circuits/knowledge.ts'
import { LIFE } from './circuits/life.ts'
import { JEV_CIRCUITS } from './circuits/jev.ts'
import { CIRCUIT_CATEGORIES } from './categories.ts'

export { DEFAULT_ROLES, RETIRED_ROLES } from './roles.ts'
export { DEFAULT_SKILLS } from './skills.ts'

/*
 * The built-in library. Every entry is ordinary data: the user can edit,
 * clone or delete any of it, and "Restore defaults" puts back whatever is
 * missing or changed without touching what they made themselves.
 *
 * Roles live in roles.ts, skills in skills.ts and circuit templates under
 * circuits/, one file per group of shelves.
 */

/**
 * Bumped when the built-in roles and skills are rebuilt rather than
 * extended. A library saved under an older version gets the new built-ins in
 * place of the old ones on its next load; the user's own entries stay.
 */
export const LIB_VERSION = 2

const T0 = 0

export const DEFAULT_MCP: McpServer[] = [
  {
    id: 'mcp-deepwiki',
    name: 'DeepWiki',
    url: 'https://mcp.deepwiki.com/mcp',
    description: 'Ask questions about any public GitHub repository and read its generated docs. No key needed.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-context7',
    name: 'Context7',
    url: 'https://mcp.context7.com/mcp',
    description: 'Up-to-date library and framework documentation for coding. Works without a key; add one for higher limits.',
    headerName: 'Context7-API-Key',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp/',
    description: 'Search code, read files, issues and pull requests across the repositories your token can see. Paste a GitHub token below.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-notion',
    name: 'Notion',
    url: 'https://mcp.notion.com/mcp',
    description: 'Search, read and write Notion pages and databases. Notion’s REST API refuses browser requests, so this server is the way in. Needs a token from a Notion integration.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-atlassian',
    name: 'Jira and Confluence',
    url: 'https://mcp.atlassian.com/v1/sse',
    description: 'Atlassian’s own server: read and create Jira issues and Confluence pages. Their REST APIs block browsers, so this is the route.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-linear',
    name: 'Linear',
    url: 'https://mcp.linear.app/mcp',
    description: 'Issues, projects and cycles in Linear, as tools a model can call mid-answer.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-asana',
    name: 'Asana',
    url: 'https://mcp.asana.com/sse',
    description: 'Asana’s own server: find, create and update tasks and projects by name rather than by ID.',
    origin: 'system',
    updatedAt: T0,
  },
  {
    id: 'mcp-huggingface',
    name: 'Hugging Face',
    url: 'https://huggingface.co/mcp',
    description: 'Search models, datasets, papers and Spaces, and read model cards. A read token raises the limits.',
    origin: 'system',
    updatedAt: T0,
  },
]

const SHELF_ORDER = new Map(CIRCUIT_CATEGORIES.map((c, i) => [c.id, i]))

/**
 * Starting points, grouped by shelf in the order CIRCUIT_CATEGORIES lists
 * them. Creating a circuit from one copies it, so the copy is the user's.
 */
export const TEMPLATES: Circuit[] = [...CLASSIC, ...ENGINEERING, ...BUSINESS, ...KNOWLEDGE, ...LIFE, ...JEV_CIRCUITS]
  .map((t, i) => ({ t, i }))
  .sort((x, y) => (SHELF_ORDER.get(x.t.category ?? '') ?? 99) - (SHELF_ORDER.get(y.t.category ?? '') ?? 99) || x.i - y.i)
  .map(({ t }) => t)
