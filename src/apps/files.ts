/**
 * Turns a model's reply into files. The "Write code" skill asks for each file
 * in its own fenced block with a path comment on the first line, so these all
 * work:
 *
 *   ```ts                   ```python src/app.py      ```html
 *   // src/index.ts         print("hi")               <!-- public/index.html -->
 *
 * Blocks without a recognisable path are skipped; a caller that needs a file
 * anyway falls back to saving the whole reply under a name it chooses.
 */
export interface ParsedFile {
  path: string
  content: string
}

const COMMENT = /^\s*(?:\/\/|#|--|;|<!--|\/\*|\*)\s*(?:file(?:name)?:\s*)?([\w@./+-]+\.[\w]+|Dockerfile|Makefile|Procfile|LICENSE|\.[\w.-]+)\s*(?:-->|\*\/)?\s*$/i
const BARE_NAMES = /^(Dockerfile|Makefile|Procfile|LICENSE|README|\.gitignore|\.env\.example)$/

function cleanPath(p: string): string | null {
  const path = p.trim().replace(/^\.?\//, '').replace(/\\/g, '/')
  if (!path || path.length > 200) return null
  if (path.split('/').some(seg => seg === '..' || seg === '')) return null
  if (!/\.[\w]+$/.test(path) && !BARE_NAMES.test(path.split('/').pop()!)) return null
  return path
}

export function parseFiles(markdown: string): ParsedFile[] {
  const files = new Map<string, string>()
  const fence = /^(```+|~~~+)([^\n]*)\n([\s\S]*?)^\1\s*$/gm
  let m: RegExpExecArray | null
  while ((m = fence.exec(markdown))) {
    const info = m[2].trim()
    let body = m[3]
    let path: string | null = null
    // ```ts src/a.ts  or  ```ts title="src/a.ts"
    const infoPath = /(?:title|file(?:name)?)=["']?([^"'\s]+)|^\S+\s+([^\s=]+\.[\w]+)$/.exec(info)
    if (infoPath) path = cleanPath(infoPath[1] ?? infoPath[2])
    if (!path) {
      const first = body.split('\n', 1)[0]
      const c = COMMENT.exec(first)
      if (c) {
        path = cleanPath(c[1])
        if (path) body = body.slice(first.length + 1)
      }
    }
    if (path) files.set(path, body.replace(/\s+$/, '') + '\n')
  }
  return [...files].map(([path, content]) => ({ path, content }))
}
