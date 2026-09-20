import { memo, useEffect, useMemo, useState } from 'react'
import { copyText, downloadFile } from './ui'

type Renderer = (src: string) => string
let renderer: Renderer | null = null
let loading: Promise<Renderer> | null = null

/** markdown-it is loaded on first use, keeping it out of the first paint. */
function load(): Promise<Renderer> {
  loading ??= import('../lib/markdown').then(m => (renderer = m.render))
  return loading
}

export function preloadMarkdown() {
  void load()
}

/**
 * Renders markdown. While a reply streams in, it re-renders at most once per
 * animation frame (the live store batches upstream), and an unfinished code
 * fence is closed temporarily so the half-written block still looks like code.
 */
export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const [ready, setReady] = useState(!!renderer)
  useEffect(() => {
    if (!renderer) void load().then(() => setReady(true))
  }, [])

  const html = useMemo(() => {
    if (!ready || !renderer) return null
    let src = text
    if (streaming && (src.match(/^```/gm)?.length ?? 0) % 2 === 1) src += '\n```'
    return renderer(src)
  }, [text, streaming, ready])

  const onClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy], [data-download]')
    if (!btn) return
    const code = btn.closest('.code')?.querySelector('code')?.textContent ?? ''
    if (btn.hasAttribute('data-download')) {
      const language = btn.dataset.download ?? 'txt'
      const extensions: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', shell: 'sh', markdown: 'md', rust: 'rs', csharp: 'cs', 'c++': 'cpp' }
      const ext = extensions[language] ?? (/^[a-z0-9]{1,12}$/i.test(language) ? language : 'txt')
      downloadFile(`snippet.${ext}`, code, 'text/plain')
      return
    }
    if (await copyText(code)) {
      btn.textContent = 'Copied'
      setTimeout(() => (btn.textContent = 'Copy'), 1400)
    }
  }

  if (html == null) return <div className="md md-plain">{text}</div>
  return <div className={streaming ? 'md streaming' : 'md'} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
})
