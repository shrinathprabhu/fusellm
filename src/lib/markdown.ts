import MarkdownIt from 'markdown-it'

/**
 * Model output rendered as Markdown, safely.
 *
 * - `html: false` escapes any raw HTML a model (or a prompt-injected tool
 *   result) writes, so nothing it says can become markup or script.
 * - Remote images are never loaded. A markdown image pointing at an attacker's
 *   server is the classic way to leak a conversation through a URL, so images
 *   render as plain links instead. The CSP blocks remote images as well.
 * - Links open in a new tab, marked nofollow/ugc because the model wrote them.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

md.renderer.rules.image = (tokens, idx) => {
  const t = tokens[idx]
  const src = String(t.attrGet('src') ?? '')
  const alt = String(t.content || 'image')
  if (!/^https?:/i.test(src)) return md.utils.escapeHtml(`[${alt}]`)
  return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer nofollow ugc">🖼 ${md.utils.escapeHtml(alt)}</a>`
}

const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener noreferrer nofollow ugc')
  return defaultLink(tokens, idx, options, env, self)
}

md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx]
  const lang = (t.info || '').trim().split(/\s+/)[0]
  const code = md.utils.escapeHtml(t.content)
  return `<div class="code"><div class="code-head"><span>${md.utils.escapeHtml(lang || 'text')}</span><button type="button" class="code-copy" data-copy>Copy</button></div><pre><code${lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : ''}>${code}</code></pre></div>`
}

const defaultTable = md.renderer.rules.table_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.table_open = (tokens, idx, options, env, self) => '<div class="table-wrap">' + defaultTable(tokens, idx, options, env, self)
md.renderer.rules.table_close = () => '</table></div>'

export function render(src: string): string {
  return md.render(src)
}
