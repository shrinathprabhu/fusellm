import { CIRCUIT_CATEGORY_LABEL } from '../library/categories'
import { go } from '../lib/router'
import { fromTemplate } from '../state/app'
import type { Circuit } from '../types'
import { Icon } from './Icon'
import { ModelDot } from './Pickers'

/** The stages of a circuit as a short chain: model dot, name, ↺ for loops. */
export function Chain({ c }: { c: Pick<Circuit, 'stages'> }) {
  return (
    <span className="chain" aria-label={`${c.stages.length} stages`}>
      {c.stages.map((s, i) => (
        <span key={s.id} className="chain-node">
          {i > 0 && (
            <span className="chain-arrow" aria-hidden="true">
              →
            </span>
          )}
          <ModelDot id={s.modelId} />
          {s.name}
          {s.loop && (
            <span className="chain-loop" title="Loops back until done" aria-label="loops">
              ↺
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

/** A template as a card; choosing it copies it into your circuits and opens it. */
export function TemplateCard({ t, shelf = true }: { t: Circuit; shelf?: boolean }) {
  return (
    <button
      type="button"
      className="tpl-card"
      onClick={() => {
        const c = fromTemplate(t.id)
        go({ name: 'circuit', id: c.id })
      }}
    >
      <span className="tpl-heading">
        <span className="tpl-emoji" aria-hidden="true">
          {t.emoji}
        </span>
        <span className="tpl-name">{t.name}</span>
      </span>
      {shelf && t.category && <span className="badge tpl-shelf">{CIRCUIT_CATEGORY_LABEL[t.category]}</span>}
      <span className="tpl-desc">{t.description}</span>
      <Chain c={t} />
      <span className="tpl-use">
        Use template <Icon name="chevron" />
      </span>
    </button>
  )
}
