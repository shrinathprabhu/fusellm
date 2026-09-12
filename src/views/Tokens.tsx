import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { ModeSwitch, ModelDot } from '../components/Pickers'
import { AutoTextarea, PageHead, Segmented, Toggle } from '../components/ui'
import { MODELS, MODEL_BY_ID, type Mode } from '../ai/catalog'
import { DEFAULT_MEDIA_MODELS } from '../ai/media'
import { buildSystem } from '../ai/prompt'
import { TEMPLATES } from '../library/defaults'
import { estimateChat, estimateCircuit, TYPICAL_OUTPUT, type Estimate, type LoopAssumption } from '../lib/estimate'
import { optimize, replyContract, REWRITE_SYSTEM, RULES, type Optimized } from '../lib/optimize'
import { runTurn } from '../ai/run'
import { readyModels } from '../state/app'
import { estimateTokens, price as fmtPrice, tokens as fmtTokens } from '../lib/format'
import { useApp } from '../state/app'

/*
 * Token calculator. Counts run on this device with OpenAI's o200k_base
 * tokenizer, loaded only when this page opens (it is about 2 MB, so it is
 * cached after first use instead of being part of the offline bundle).
 */

type Tokenizer = typeof import('gpt-tokenizer/encoding/o200k_base')

let loaded: Tokenizer | null = null
let loading: Promise<Tokenizer> | null = null

function useTokenizer(): { tk: Tokenizer | null; failed: boolean } {
  const [tk, setTk] = useState<Tokenizer | null>(loaded)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    loading ??= import('gpt-tokenizer/encoding/o200k_base').then(m => (loaded = m))
    loading.then(setTk, () => {
      loading = null
      setFailed(true)
    })
  }, [])
  return { tk, failed }
}

// Kept across visits to the page within a session.
let draft = ''

/** Two significant figures below a cent, so tiny costs still compare. */
const usd = (n: number) =>
  n === 0 ? '$0' : n < 1e-6 ? '<$0.000001' : n < 0.01 ? `$${n.toFixed(Math.min(7, 1 - Math.floor(Math.log10(n))))}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`

type Use = 'input' | 'output'
type Tab = 'models' | 'chat' | 'circuit'

export default function Tokens() {
  const { tk, failed } = useTokenizer()
  const [text, setText] = useState(draft)
  const deferred = useDeferredValue(text)
  const [use, setUse] = useState<Use>('input')
  const [tab, setTab] = useState<Tab>('models')
  const [capWords, setCapWords] = useState<number | null>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    draft = text
  }, [text])

  const count = useMemo(() => (tk ? (t: string) => tk.countTokens(t) : estimateTokens), [tk])
  const stats = useMemo(() => {
    const t = deferred
    return {
      tokens: t ? count(t) : 0,
      words: t.trim() ? t.trim().split(/\s+/).length : 0,
      noSpace: [...t.replace(/\s/g, '')].length,
      chars: [...t].length,
      lines: t ? t.split('\n').length : 0,
    }
  }, [deferred, count])

  // A word is about 1.35 tokens in English, which is what a reply cap buys.
  const capTokens = capWords ? Math.round(capWords * 1.35) : undefined
  const exact = !!tk
  return (
    <div className="page tokens">
      <PageHead
        title="Token calculator"
        sub="Paste a prompt, some context or a reply. See how many tokens it is and what it would cost: on its own, across a chat, or run through one of your circuits."
      />

      <section className="card pad stack">
        <div className="row between wrap">
          <label className="label" htmlFor="tok-text">
            Your text
          </label>
          <span className="row wrap">
            <button
              type="button"
              className="btn ghost small"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText()
                  if (t) setText(t)
                } catch {
                  document.getElementById('tok-text')?.focus()
                }
              }}
            >
              <Icon name="copy" /> Paste
            </button>
            <button type="button" className="btn ghost small" onClick={() => file.current?.click()}>
              <Icon name="upload" /> Open file
            </button>
            {text && (
              <button type="button" className="btn ghost small" onClick={() => setText('')}>
                <Icon name="x" /> Clear
              </button>
            )}
          </span>
        </div>
        <AutoTextarea
          id="tok-text"
          className="textarea mono tok-input"
          maxRows={16}
          rows={6}
          placeholder="Paste text, code, a document or a model's answer…"
          value={text}
          spellCheck={false}
          onChange={e => setText(e.target.value)}
        />
        <input
          ref={file}
          type="file"
          hidden
          accept=".txt,.md,.markdown,.json,.csv,.tsv,.html,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.rb,.php,.c,.cpp,.h,.css,.sql,.sh,.log,text/*"
          onChange={async e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) setText(await f.text())
          }}
        />
        <div className="field">
          <span className="label">
            Treat it as{' '}
            <InfoTip label="What this changes">
              <p>
                <strong>Input</strong>: something you send, like a brief, a document or context. It is counted at each model’s input price, and it becomes the brief when you estimate a circuit.
              </p>
              <p>
                <strong>A typical reply</strong>: a sample of what you expect a model to write back. It is counted at output prices, and every step of a chat or circuit is assumed to write about this much.
              </p>
            </InfoTip>
          </span>
          <Segmented<Use>
            label="Treat the text as"
            value={use}
            onChange={setUse}
            options={[
              { id: 'input', label: 'Input: brief or context' },
              { id: 'output', label: 'A typical reply' },
            ]}
          />
        </div>
      </section>

      <section className="tok-stats" aria-label="Token summary" aria-live="polite">
        <Stat label="Tokens" value={stats.tokens} strong approx={!exact} />
        <Stat label="Words" value={stats.words} />
        <Stat label="Characters without spaces" short="No-space chars" value={stats.noSpace} />
        <Stat label="All characters" short="All chars" value={stats.chars} />
      </section>
      <p className="hint tok-note">
        {exact ? (
          <>
            Counted exactly with OpenAI’s o200k_base tokenizer, on this device. Claude, Gemini, Grok and the others split text their own way, so their counts will differ somewhat; treat their costs as estimates.
          </>
        ) : failed ? (
          <>The tokenizer could not load (offline?). Showing a character-based estimate instead.</>
        ) : (
          <>Loading the tokenizer… showing a quick estimate meanwhile.</>
        )}
      </p>

      <Optimiser text={text} setText={setText} count={count} capWords={capWords} setCapWords={setCapWords} />

      <div className="tok-tabs">
        <Segmented<Tab>
          label="Estimate for"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'models', label: 'Every model' },
            { id: 'chat', label: 'A chat' },
            { id: 'circuit', label: 'A circuit' },
          ]}
        />
      </div>

      {tab === 'models' && <EveryModel tokens={stats.tokens} use={use} />}
      {tab === 'chat' && <ChatEstimate tokens={stats.tokens} use={use} count={count} cap={capTokens} />}
      {tab === 'circuit' && <CircuitEstimate tokens={stats.tokens} use={use} count={count} cap={capTokens} />}

      <TokenView text={deferred} tk={tk} />

      <AlsoOnLowkey where="tokens" />

      <footer className="page-foot">
        <Credits />
      </footer>
    </div>
  )
}

function Stat({ label, short, value, strong, approx }: { label: string; short?: string; value: number; strong?: boolean; approx?: boolean }) {
  return (
    <div className={strong ? 'tok-stat strong' : 'tok-stat'}>
      <span className="tok-stat-value mono">
        {approx ? '≈' : ''}
        {value.toLocaleString()}
      </span>
      <span className="tok-stat-label" title={label}>
        {short ?? label}
      </span>
    </div>
  )
}

/* ── optimiser ───────────────────────────────────────────── */

const CONTRACT_RE = /\n\nAnswer in at most \d+ words\.[^\n]*$/

function Optimiser({
  text,
  setText,
  count,
  capWords,
  setCapWords,
}: {
  text: string
  setText: (t: string) => void
  count: (t: string) => number
  capWords: number | null
  setCapWords: (n: number | null) => void
}) {
  const settings = useApp(s => s.settings, Object.is)
  const [undo, setUndo] = useState<string | null>(null)
  const [result, setResult] = useState<Optimized | null>(null)
  const [words, setWords] = useState(200)
  const [rewrite, setRewrite] = useState<{ text: string; cost?: number; after: number; model: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = readyModels(settings)
  const [modelId, setModelId] = useState(() => [...ready].sort((a, b) => (MODEL_BY_ID[a]?.price.in ?? 0) - (MODEL_BY_ID[b]?.price.in ?? 0))[0] ?? '')
  const tokens = count(text)

  if (!text.trim()) return null

  const setCap = (on: boolean, w = words) => {
    const bare = text.replace(CONTRACT_RE, '')
    setUndo(text)
    setText(on ? bare + replyContract(w) : bare)
    setCapWords(on ? w : null)
  }

  const runLocal = () => {
    const r = optimize(text, { count })
    setUndo(text)
    setText(r.text)
    setResult(r)
    setRewrite(null)
  }

  const def = MODEL_BY_ID[modelId]

  const runModel = async () => {
    setBusy(true)
    setError('')
    setRewrite(null)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 120_000)
    const out = await runTurn({
      settings,
      modelId,
      system: REWRITE_SYSTEM,
      messages: [{ role: 'user', content: text.replace(CONTRACT_RE, '') }],
      mode: 'fast',
      webSearch: false,
      mcp: [],
      budget: 0,
      signal: ctl.signal,
      onLive: () => {},
    })
    clearTimeout(timer)
    setBusy(false)
    const clean = out.text.trim().replace(/^```[a-z]*\n([\s\S]*)\n```$/i, '$1')
    if (out.error || !clean) setError(out.error || 'The model returned nothing.')
    else setRewrite({ text: clean + (capWords ? replyContract(capWords) : ''), cost: out.usage.cost, after: count(clean), model: def?.name ?? modelId })
  }

  const saved = result ? result.before - result.after : 0
  const rewriteCost = def ? (tokens * def.price.in + tokens * 0.7 * def.price.out) / 1e6 : 0

  return (
    <section className="card pad stack optimiser">
      <div className="row between wrap">
        <h2 className="section-title">
          Optimise{' '}
          <InfoTip label="What optimising does" wide>
            <p>
              <strong>Tidy it up</strong> runs on this device, costs nothing and only makes changes that cannot alter meaning: whitespace, invisible characters pasted from documents, curly quotes and dashes, a small list of filler phrases,
              repeated paragraphs, table padding and HTML comments.
            </p>
            <p>Anything inside a code fence, inline code or a URL is left byte for byte as it was.</p>
            <p>
              <strong>Rewrite with a model</strong> asks a model to say the same thing in fewer words. It can change wording and occasionally drops a nuance, so it is shown side by side for you to accept.
            </p>
            <p>
              Output is where the money goes, at three to five times the input price. A <strong>reply cap</strong> is the reliable lever, and picking <em>Fast</em> mode cuts hidden reasoning, which is billed as output too.
            </p>
          </InfoTip>
        </h2>
        {undo && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              setText(undo)
              setUndo(null)
              setResult(null)
              setRewrite(null)
              if (CONTRACT_RE.test(undo)) setCapWords(Number(undo.match(/at most (\d+) words/)?.[1]) || null)
              else setCapWords(null)
            }}
          >
            <Icon name="refresh" /> Undo
          </button>
        )}
      </div>

      <div className="row wrap">
        <button type="button" className="btn primary" onClick={runLocal}>
          <Icon name="sparkle" /> Tidy it up
        </button>
        <span className="small muted">Free, on this device. Never touches code or links.</span>
      </div>

      {result &&
        (saved > 0 ? (
          <div className="opt-result">
            <p className="opt-saved">
              <strong className="mono">−{saved.toLocaleString()}</strong> tokens ({Math.round((saved / Math.max(1, result.before)) * 100)}% smaller), every time you send it.
            </p>
            <ul className="opt-edits">
              {result.edits.map(e => (
                <li key={e.rule} title={RULES.find(r => r.id === e.rule)?.hint}>
                  {e.label} <span className="mono tiny">×{e.count}</span>
                  {e.saved > 0 && <span className="mono tiny faint"> −{e.saved}</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hint">Already tight: there was nothing safe to remove.</p>
        ))}

      <hr className="divider" />
      <Toggle
        checked={capWords != null}
        onChange={on => setCap(on)}
        label="Cap the reply length"
        hint={`Appends a short instruction that stops preambles, restating and sign-offs. About ${Math.round(words * 1.35).toLocaleString()} output tokens instead of the ${fmtTokens(TYPICAL_OUTPUT.balanced)} a balanced reply usually runs to, and the estimates below use it. Output costs three to five times input, so this is the bigger saving.`}
      />
      {capWords != null && (
        <label className="field tok-times">
          <span className="label">Words allowed</span>
          <input
            className="input mono"
            type="number"
            min={20}
            max={4000}
            step={10}
            value={words}
            onChange={e => {
              const w = Math.max(20, Math.min(4000, Number(e.target.value) || 200))
              setWords(w)
              setCap(true, w)
            }}
          />
        </label>
      )}

      {ready.length > 0 && (
        <>
          <hr className="divider" />
          <div className="row wrap tok-controls">
            <button type="button" className="btn" disabled={busy || !modelId} onClick={() => void runModel()}>
              <Icon name="brain" /> {busy ? 'Rewriting…' : 'Rewrite with a model'}
            </button>
            <select className="select auto" value={modelId} onChange={e => setModelId(e.target.value)} aria-label="Model for the rewrite">
              {ready.map(id => (
                <option key={id} value={id}>
                  {MODEL_BY_ID[id]?.name ?? id}
                </option>
              ))}
            </select>
            <span className="small muted">{rewriteCost > 0 ? `Uses your key, about ${usd(rewriteCost)}.` : 'Uses your key. This model is free.'}</span>
          </div>
          {error && <p className="error-text small">{error}</p>}
          {rewrite && (
            <div className="opt-result">
              <p className="opt-saved">
                <strong className="mono">
                  {rewrite.after < tokens ? '−' : '+'}
                  {Math.abs(tokens - rewrite.after).toLocaleString()}
                </strong>{' '}
                tokens ({tokens.toLocaleString()} → {rewrite.after.toLocaleString()}) from {rewrite.model}, which cost {usd(rewrite.cost ?? 0)}. Read it before you use it: a rewrite can drop a detail.
              </p>
              <textarea className="textarea mono opt-preview" readOnly rows={8} value={rewrite.text} aria-label="Rewritten prompt" />
              <div className="row wrap">
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => {
                    setUndo(text)
                    setText(rewrite.text)
                    setRewrite(null)
                    setResult(null)
                  }}
                >
                  <Icon name="check" /> Use this
                </button>
                <button type="button" className="btn ghost small" onClick={() => setRewrite(null)}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ── every model ─────────────────────────────────────────── */

function EveryModel({ tokens, use }: { tokens: number; use: Use }) {
  const [times, setTimes] = useState(1)
  const [sort, setSort] = useState<'in' | 'out' | 'name'>(use === 'output' ? 'out' : 'in')
  const rows = useMemo(() => {
    const list = MODELS.map(m => ({
      m,
      input: (tokens * m.price.in * times) / 1e6,
      output: (tokens * m.price.out * times) / 1e6,
      fit: tokens / m.context,
      fitsOut: tokens <= m.maxOutput,
    }))
    return list.sort((a, b) => (sort === 'name' ? a.m.name.localeCompare(b.m.name) : sort === 'in' ? a.input - b.input || a.output - b.output : a.output - b.output || a.input - b.input))
  }, [tokens, times, sort])

  const paid = rows.filter(r => r.m.price.in > 0)
  const cheapestIn = [...paid].sort((a, b) => a.input - b.input)[0]
  const priciestOut = [...rows].sort((a, b) => b.output - a.output)[0]
  const tooBig = rows.filter(r => r.fit > 1)

  return (
    <section className="block" aria-label="Cost on every model">
      <div className="tok-snap">
        <div className="tok-snap-card">
          <span className="label">Cheapest to send</span>
          <strong className="mono">{cheapestIn ? usd(cheapestIn.input) : '–'}</strong>
          <span className="small muted">{cheapestIn?.m.name}</span>
        </div>
        <div className="tok-snap-card">
          <span className="label">Priciest to write</span>
          <strong className="mono">{priciestOut ? usd(priciestOut.output) : '–'}</strong>
          <span className="small muted">{priciestOut?.m.name}</span>
        </div>
        <div className="tok-snap-card">
          <span className="label">Fits the context window of</span>
          <strong className="mono">
            {rows.length - tooBig.length} of {rows.length}
          </strong>
          <span className="small muted">{tooBig.length ? `Too long for ${tooBig.map(r => r.m.short).join(', ')}` : 'every model here'}</span>
        </div>
      </div>

      <div className="row wrap tok-controls">
        <label className="field tok-times">
          <span className="label">Times sent</span>
          <input className="input mono" type="number" min={1} max={1_000_000} value={times} onChange={e => setTimes(Math.max(1, Math.min(1_000_000, Number(e.target.value) || 1)))} />
        </label>
        <span className="grow" />
        <Segmented<'in' | 'out' | 'name'>
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { id: 'in', label: 'Input cost' },
            { id: 'out', label: 'Output cost' },
            { id: 'name', label: 'Name' },
          ]}
        />
      </div>

      <div className="table-wrap">
        <table className="tok-table">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" className="num">
                As input
              </th>
              <th scope="col" className="num">
                As output
              </th>
              <th scope="col" className="num">
                Context used
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.m.id} className={use === 'input' ? 'hl-in' : 'hl-out'}>
                <th scope="row">
                  <span className="tok-model">
                    <ModelDot id={r.m.id} />
                    {r.m.name}
                  </span>
                  <span className="tiny faint mono">
                    {r.m.price.in + r.m.price.out === 0 ? 'free' : `${fmtPrice(r.m.price.in)} in · ${fmtPrice(r.m.price.out)} out per 1M`}
                  </span>
                </th>
                <td className="num mono in">{r.m.price.in === 0 ? 'free' : usd(r.input)}</td>
                <td className="num mono out">
                  {r.m.price.out === 0 ? 'free' : usd(r.output)}
                  {!r.fitsOut && <span className="badge warn" title={`Writes at most ${fmtTokens(r.m.maxOutput)} tokens in one reply`}>too long</span>}
                </td>
                <td className="num mono">
                  <span className={r.fit > 1 ? 'error-text' : r.fit > 0.8 ? 'warn-text' : undefined}>{r.fit < 0.001 && tokens ? '<0.1%' : `${Math.min(999, r.fit * 100).toFixed(r.fit < 0.1 ? 1 : 0)}%`}</span>
                  <span className="tiny faint"> of {fmtTokens(r.m.context)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">List prices per million tokens, as on OpenRouter. Direct keys and cached prompts can be cheaper. Reasoning models also bill their hidden thinking as output.</p>
    </section>
  )
}

/* ── a chat ──────────────────────────────────────────────── */

function ChatEstimate({ tokens, use, count, cap }: { tokens: number; use: Use; count: (t: string) => number; cap?: number }) {
  const settings = useApp(s => s.settings, Object.is)
  const [modelId, setModelId] = useState(settings.defaultModel ?? 'claude-sonnet')
  const [mode, setMode] = useState<Mode>(settings.defaultMode)
  const [turns, setTurns] = useState(6)
  const system = useMemo(() => count(buildSystem({ skills: [], mode })), [count, mode])
  const est = estimateChat({ modelId, mode, turns, system, first: use === 'input' ? tokens + 40 : 120, replyTokens: cap ?? (use === 'output' && tokens ? tokens : undefined) })
  const def = MODEL_BY_ID[modelId]
  const max = Math.max(1, ...est.steps.map(s => s.input + s.output + s.reasoning))

  return (
    <section className="block stack" aria-label="Chat estimate">
      <div className="tok-form">
        <label className="field">
          <span className="label">Model</span>
          <select className="select" value={modelId} onChange={e => setModelId(e.target.value)}>
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Turns</span>
          <input className="input mono" type="number" min={1} max={100} value={turns} onChange={e => setTurns(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        </label>
        <div className="field span-all">
          <span className="label">Mode</span>
          <ModeSwitch value={mode} onChange={setMode} />
        </div>
      </div>
      <p className="hint">
        {use === 'input' ? 'Your text opens the chat; each later question is short.' : 'A short question opens the chat; every reply is as long as your text.'} Every turn resends the whole conversation, so input grows with each one.
        {use === 'input' || !tokens ? ` Replies assumed around ${fmtTokens(TYPICAL_OUTPUT[mode])} tokens in ${mode} mode.` : ''}
      </p>
      <Totals est={est} label={`${turns} turns on ${def?.name ?? modelId}`} />
      <ol className="tok-bars" aria-label="Tokens per turn">
        {est.steps.map(s => (
          <li key={s.stageId}>
            <span className="tiny mono faint">{s.name.replace('Turn ', '#')}</span>
            <span className="tok-bar" aria-hidden="true">
              <span className="in" style={{ width: `${(s.input / max) * 100}%` }} />
              <span className="out" style={{ width: `${((s.output + s.reasoning) / max) * 100}%` }} />
            </span>
            <span className="tiny mono">
              {fmtTokens(s.input + s.output + s.reasoning)} · {usd(s.cost)}
            </span>
          </li>
        ))}
      </ol>
      <p className="tiny faint legend">
        <span className="lg in" /> input <span className="lg out" /> output and reasoning
      </p>
    </section>
  )
}

/* ── a circuit ───────────────────────────────────────────── */

function CircuitEstimate({ tokens, use, count, cap }: { tokens: number; use: Use; count: (t: string) => number; cap?: number }) {
  const { circuits, roles, skills } = useApp(s => ({ circuits: s.circuits, roles: s.roles, skills: s.skills }))
  const [pick, setPick] = useState(() => circuits[0]?.id ?? TEMPLATES[0].id)
  const [loops, setLoops] = useState<LoopAssumption>('typical')
  const circuit = circuits.find(c => c.id === pick) ?? TEMPLATES.find(t => t.id === pick) ?? TEMPLATES[0]
  const est = useMemo(
    () => estimateCircuit(circuit, { brief: use === 'input' ? tokens : 150, replyTokens: cap ?? (use === 'output' && tokens ? tokens : undefined), loops, roles, skills, count }),
    [circuit, tokens, use, cap, loops, roles, skills, count],
  )
  const media = est.steps.filter(s => s.media)
  const mediaFiles = media.reduce((n, s) => n + (s.media?.count ?? 0), 0)

  return (
    <section className="block stack" aria-label="Circuit estimate">
      <div className="tok-form">
        <label className="field span-all">
          <span className="label">Circuit</span>
          <select className="select" value={circuit.id} onChange={e => setPick(e.target.value)}>
            {circuits.length > 0 && (
              <optgroup label="Your circuits">
                {circuits.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Templates">
              {TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="field span-all">
          <span className="label">
            Loops{' '}
            <InfoTip label="About loops">
              <p>Reviewers send work back until they approve it or run out of rounds. How many rounds happen depends on the work, so pick an assumption:</p>
              <p>
                <strong>Approved first time</strong>: no loops. <strong>Typical</strong>: about half the allowed rounds. <strong>Every round</strong>: the most the circuit allows, the worst case.
              </p>
            </InfoTip>
          </span>
          <Segmented<LoopAssumption>
            label="Loop assumption"
            value={loops}
            onChange={setLoops}
            options={[
              { id: 'best', label: 'Approved first time' },
              { id: 'typical', label: 'Typical' },
              { id: 'worst', label: 'Every round' },
            ]}
          />
        </div>
      </div>
      <p className="hint">
        {use === 'input' ? 'Your text is the brief.' : 'A short brief is assumed, and every model step writes about as much as your text.'} Each step’s input adds its role, skills and task, plus whatever its wires carry: the previous output, every step so far, or
        shared memory.
      </p>

      <Totals est={est} label={`${circuit.emoji} ${circuit.name}`} />
      {est.budgetAt != null && (
        <div className="callout warn">
          <Icon name="gauge" />
          <span className="small">
            The stop-loss of {fmtTokens(circuit.budget)} tokens would likely stop this run around step {est.budgetAt + 1}, {est.steps[est.budgetAt].name}. Raise it in the circuit if you expect this much work.
          </span>
        </div>
      )}
      {est.capped && (
        <div className="callout">
          <Icon name="info" />
          <span className="small">This reaches the circuit’s limit of {circuit.maxSteps} steps before finishing.</span>
        </div>
      )}

      <div className="table-wrap">
        <table className="tok-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col" className="num">
                Input
              </th>
              <th scope="col" className="num">
                Output
              </th>
              <th scope="col" className="num">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {est.steps.map((s, i) => {
              const mm = s.media ? DEFAULT_MEDIA_MODELS.find(m => m.id === s.model) : undefined
              return (
                <tr key={i} className={est.budgetAt != null && i >= est.budgetAt ? 'over' : undefined}>
                  <th scope="row">
                    <span className="tok-model">
                      <span className="mono faint tiny">{i + 1}</span> {s.name}
                      {s.round > 1 && <span className="badge">round {s.round}</span>}
                    </span>
                    <span className="tiny faint">
                      {s.media ? `${s.media.count} × ${s.media.job} · ${mm?.name ?? s.model}` : s.model}
                      {s.note ? ` · ${s.note}` : ''}
                    </span>
                  </th>
                  {s.kind === 'model' ? (
                    <>
                      <td className="num mono">{fmtTokens(s.input)}</td>
                      <td className="num mono">
                        {fmtTokens(s.output)}
                        {s.reasoning > 0 && <span className="tiny faint"> +{fmtTokens(s.reasoning)}</span>}
                      </td>
                      <td className="num mono">{usd(s.cost)}</td>
                    </>
                  ) : (
                    <td className="num small muted" colSpan={3}>
                      {s.kind === 'action' ? 'no model tokens' : s.media ? (mm?.price ?? 'billed per file') : 'free'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {mediaFiles > 0 && (
        <p className="hint">
          Plus {mediaFiles} generated file{mediaFiles > 1 ? 's' : ''} ({[...new Set(media.map(s => s.media!.job))].join(', ')}), billed per image, second or track by the media provider. The Studio shows each model’s price before you generate.
        </p>
      )}
      <p className="hint">
        Output includes hidden reasoning (after the +) for models that think. Typical reply lengths: fast {fmtTokens(TYPICAL_OUTPUT.fast)}, balanced {fmtTokens(TYPICAL_OUTPUT.balanced)}, deep {fmtTokens(TYPICAL_OUTPUT.deep)} tokens. Paste a real reply and choose
        “A typical reply” for a closer number.
      </p>
      {circuits.some(c => c.id === circuit.id) && (
        <a className="btn small" href={`#/circuit/${circuit.id}`}>
          Open {circuit.name} <Icon name="chevron" />
        </a>
      )}
    </section>
  )
}

function Totals({ est, label }: { est: Estimate; label: string }) {
  return (
    <div className="tok-snap">
      <div className="tok-snap-card">
        <span className="label">Estimated cost</span>
        <strong className="mono">{usd(est.cost)}</strong>
        <span className="small muted">{label}</span>
      </div>
      <div className="tok-snap-card">
        <span className="label">Tokens in</span>
        <strong className="mono">{fmtTokens(est.input)}</strong>
        <span className="small muted">{est.steps.filter(s => s.kind === 'model').length} model calls</span>
      </div>
      <div className="tok-snap-card">
        <span className="label">Tokens out</span>
        <strong className="mono">{fmtTokens(est.output + est.reasoning)}</strong>
        <span className="small muted">{est.reasoning ? `${fmtTokens(est.reasoning)} of it reasoning` : 'no hidden reasoning'}</span>
      </div>
    </div>
  )
}

/* ── token view ──────────────────────────────────────────── */

const VIEW_LIMIT = 2_000

function TokenView({ text, tk }: { text: string; tk: Tokenizer | null }) {
  const [ids, setIds] = useState(false)
  const pieces = useMemo(() => {
    if (!tk || !text) return { list: [] as { text: string; ids: number[] }[], total: 0 }
    const all = tk.encode(text)
    const out: { text: string; ids: number[] }[] = []
    let group: number[] = []
    // A token can hold part of a multi-byte character; merge until it decodes cleanly.
    for (const id of all.slice(0, VIEW_LIMIT)) {
      group.push(id)
      const t = tk.decode(group)
      if (!t.endsWith('�') || group.length > 3) {
        out.push({ text: t, ids: group })
        group = []
      }
    }
    if (group.length) out.push({ text: tk.decode(group), ids: group })
    return { list: out, total: all.length }
  }, [text, tk])

  if (!tk || !text) return null
  return (
    <section className="card pad stack" aria-labelledby="tok-view-title">
      <div className="row between wrap">
        <h2 id="tok-view-title" className="section-title">
          Token view
        </h2>
        <label className="switch small">
          <input type="checkbox" checked={ids} onChange={e => setIds(e.target.checked)} />
          <span className="track" aria-hidden="true" />
          <span className="switch-text">Show token IDs</span>
        </label>
      </div>
      <p className="hint">Each coloured piece is one token as the o200k_base tokenizer splits it.{pieces.total > VIEW_LIMIT ? ` Showing the first ${VIEW_LIMIT.toLocaleString()} of ${pieces.total.toLocaleString()}.` : ''}</p>
      <div className={ids ? 'tok-view ids mono' : 'tok-view mono'} aria-label="Text split into tokens">
        {pieces.list.map((p, i) => (
          <span key={i} className={`tk c${i % 6}`} title={`Token ${p.ids.join(', ')}`}>
            {ids ? p.ids.join(' ') : p.text.replace(/\n/g, '↵\n')}
          </span>
        ))}
      </div>
    </section>
  )
}
