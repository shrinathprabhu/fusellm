import { SITE } from '../content/site'

/**
 * The one-line credit on exported Markdown, on by default and switchable in
 * Settings. Files people share carry a link back to the tool and its makers.
 */
export function withCredit(markdown: string, on: boolean): string {
  if (!on) return markdown
  return `${markdown.trimEnd()}\n\n---\n\n<sub>Made with [FuseLLM](${SITE.canonical}), free multi-model circuits in your browser · by [Shrinath Prabhu](${SITE.author.url}) and [OwlEye Analytics](${SITE.org.url})</sub>\n`
}
