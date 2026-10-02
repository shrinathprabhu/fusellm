import { useRef, useState } from 'react'
import { AlsoOnLowkey, Credits } from '../components/Brand'
import { Icon } from '../components/Icon'
import { InstallButton } from '../components/InstallButton'
import { ModeSwitch, BudgetInput } from '../components/Pickers'
import { Confirm, downloadFile, PageHead, Segmented, Sheet, Toggle } from '../components/ui'
import { exportData, importData, lockKeys, removeLock, toast, updateSettings, useApp, wipeEverything } from '../state/app'
import { checkForUpdate, reloadFromNetwork, updatesSupported } from '../lib/update'
import { startAnalytics, stopAnalytics } from '../lib/analytics'
import { SITE } from '../content/site'
import { DEFAULT_TRANSCRIBE_MODEL, TRANSCRIBE_MODELS } from '../ai/transcribe'
import { DEFAULT_TTS_MODEL, TTS_MODELS } from '../components/ReadAloud'
import type { Theme } from '../types'
import StorageCard from '../components/StorageCard'

export default function SettingsView() {
  const settings = useApp(s => s.settings, Object.is)
  const [lockOpen, setLockOpen] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [wipe, setWipe] = useState(false)
  const [includeKeys, setIncludeKeys] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const hasKeys = Object.values(settings.keys).some(Boolean)

  return (
    <div className="page settings">
      <PageHead title="Settings" sub="Everything is stored on this device. There is no account and nothing to sync." />

      <section className="card pad stack">
        <h2 className="section-title">Appearance</h2>
        <div className="field">
          <span className="label">Theme</span>
          <Segmented<Theme>
            label="Theme"
            value={settings.theme}
            onChange={theme => updateSettings({ theme })}
            options={[
              { id: 'system', label: 'System' },
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <div className="row between wrap">
          <span className="small muted">Install FuseLLM as an app. It opens offline and gets its own window.</span>
          <InstallButton />
        </div>
      </section>

      <section className="card pad stack">
        <h2 className="section-title">Defaults</h2>
        <div className="field">
          <span className="label">Mode for new chats and stages</span>
          <ModeSwitch value={settings.defaultMode} onChange={defaultMode => updateSettings({ defaultMode })} />
        </div>
        <div className="field">
          <span className="label">Dictation</span>
          <Segmented
            label="Dictation"
            value={settings.dictation ?? 'auto'}
            onChange={dictation => updateSettings({ dictation })}
            options={[
              { id: 'auto', label: 'Automatic', title: 'A speech-to-text model when a key allows, the browser otherwise' },
              { id: 'model', label: 'Speech-to-text model', title: 'Record, then transcribe on your OpenRouter or OpenAI key' },
              { id: 'browser', label: 'Browser', title: 'The browser’s own live recogniser' },
            ]}
          />
          <p className="hint">The mic buttons in chat, circuit briefs and the Studio. A model is more accurate and costs a fraction of a cent a minute on your key. The browser option is free and live, but Chrome sends the audio to Google to recognise it; Safari mostly keeps it on the device.</p>
          <label className="field">
            <span className="label">Speech-to-text model</span>
            <select className="select" data-owleye-track="settings-transcribe-model" value={settings.transcribeModel || DEFAULT_TRANSCRIBE_MODEL} onChange={e => updateSettings({ transcribeModel: e.target.value })}>
              {TRANSCRIBE_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.note}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span className="label">Read replies aloud</span>
          <Segmented
            label="Read replies aloud"
            value={settings.readAloud ?? 'auto'}
            onChange={readAloud => updateSettings({ readAloud })}
            options={[
              { id: 'auto', label: 'Automatic', title: 'A voice model when there is an OpenRouter key, the browser otherwise' },
              { id: 'model', label: 'Voice model', title: 'Natural voices on your OpenRouter key' },
              { id: 'browser', label: 'Browser voice', title: 'Free and on the device' },
            ]}
          />
          <label className="field">
            <span className="label">Voice model</span>
            <select className="select" value={settings.ttsModel || DEFAULT_TTS_MODEL} onChange={e => updateSettings({ ttsModel: e.target.value })}>
              {TTS_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <span className="hint">The speaker button under each chat reply. Code, tables and links are skipped, and a reply you have heard once replays for free.</span>
          </label>
        </div>
        <BudgetInput label="Chat stop-loss for new chats" value={settings.chatBudget} onChange={chatBudget => updateSettings({ chatBudget })} hint="Per request, input included. Each chat can override it." />
        <Toggle
          checked={settings.creditFooter}
          onChange={creditFooter => updateSettings({ creditFooter })}
          label="Credit FuseLLM in exported files"
          hint="Adds one small line with a link at the end of downloaded Markdown. It helps other people find the tool."
        />
        <Toggle
          checked={settings.claudeFallbacks}
          onChange={claudeFallbacks => updateSettings({ claudeFallbacks })}
          label="Claude refusal fallbacks"
          hint="On a direct Anthropic key, if Fable or Opus 5 declines a request, Anthropic retries it on a suitable model instead of ending the run."
        />
      </section>

      <section className="card pad stack">
        <h2 className="section-title">Key security</h2>
        {settings.locked ? (
          <>
            <p className="small">
              <span className="badge ok">
                <Icon name="lock" size={12} /> Locked
              </span>{' '}
              Keys are encrypted with AES-GCM using your passphrase. You enter it once per session.
            </p>
            <button type="button" className="btn small" onClick={() => void removeLock().then(() => toast('Passphrase removed'))}>
              <Icon name="unlock" /> Remove passphrase
            </button>
          </>
        ) : (
          <>
            <p className="small muted">
              Keys are stored in this browser's IndexedDB, readable only by this site on this device. Add a passphrase to encrypt them at rest, useful on shared computers.
            </p>
            <button type="button" className="btn small" disabled={!hasKeys} onClick={() => setLockOpen(true)}>
              <Icon name="lock" /> Lock keys with a passphrase
            </button>
          </>
        )}
      </section>

      <StorageCard />

      <section className="card pad stack">
        <h2 className="section-title">Usage statistics</h2>
        <Toggle
          checked={settings.analytics !== false}
          onChange={analytics => {
            updateSettings({ analytics })
            if (analytics) startAnalytics()
            else stopAnalytics()
          }}
          label="Share cookie-free usage statistics"
          hint={
            <>
              Which screens open, which features and models are used, how long calls take and whether they fail, counted by{' '}
              <a href={SITE.org.url} target="_blank" rel="noopener">
                OwlEye Analytics
              </a>
              . Never your prompts, replies, files, keys, or the names of your chats and circuits. No cookies, and it is already off when your browser sends Do Not Track or Global Privacy Control.
            </>
          }
        />
      </section>

      <section className="card pad stack">
        <h2 className="section-title">App version</h2>
        <p className="small muted">
          v{SITE.version} · built {__BUILD_ID__}. The app caches itself so it opens offline, which means a device can stay a release behind until it
          swaps the cached copy — most often a phone reopened from the app switcher. Neither button below touches your chats, circuits, runs, media or keys.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="btn small"
            disabled={!updatesSupported()}
            onClick={async () => {
              const r = await checkForUpdate()
              if (r === 'updating') toast('A newer version is installing. It will load in a moment.')
              else if (r === 'current') toast('This is the latest version.')
              else toast('No cached copy to update on this device.')
            }}
          >
            <Icon name="refresh" /> Check for updates
          </button>
          <button type="button" className="btn small" onClick={() => void reloadFromNetwork()}>
            <Icon name="download" /> Reload from the network
          </button>
        </div>
        <p className="hint">
          "Reload from the network" drops the cached app files and fetches them again. It always works when the first button does not, and your data stays where it is.
        </p>
      </section>

      <section className="card pad stack">
        <h2 className="section-title">Backup</h2>
        <p className="small muted">One JSON file with your circuits, chats, runs and library, for any browser. Generated media is not included; mirror to a folder for that.</p>
        <div className="row wrap">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              downloadFile(`fusellm-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportData(includeKeys), null, 2), 'application/json')
              toast(includeKeys ? 'Backup saved. It contains your keys; keep it private.' : 'Backup saved')
            }}
          >
            <Icon name="download" /> Export backup
          </button>
          <button type="button" className="btn small" onClick={() => file.current?.click()}>
            <Icon name="upload" /> Import backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                toast(await importData(JSON.parse(await f.text())))
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Import failed', 'err')
              }
            }}
          />
        </div>
        <Toggle checked={includeKeys} onChange={setIncludeKeys} label="Include API keys in the export" hint="Off by default. Only turn on for moving to your own other device." />
        <hr className="divider" />
        <button type="button" className="btn small danger" onClick={() => setWipe(true)}>
          <Icon name="trash" /> Erase everything on this device
        </button>
      </section>

      <AlsoOnLowkey where="settings" />

      <footer className="page-foot">
        <Credits />
      </footer>

      <Sheet
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        title="Lock keys"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setLockOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={pass.length < 8 || pass !== pass2}
              onClick={async () => {
                await lockKeys(pass)
                setPass('')
                setPass2('')
                setLockOpen(false)
                toast('Keys encrypted')
              }}
            >
              <Icon name="lock" /> Encrypt keys
            </button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted">At least 8 characters. There is no recovery: if you forget it you will need to paste your keys again. Chats and circuits are not affected.</p>
          <label className="field">
            <span className="label">Passphrase</span>
            <input className="input" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Repeat it</span>
            <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={e => setPass2(e.target.value)} />
          </label>
          {pass2 && pass !== pass2 && <p className="error-text small">They do not match.</p>}
        </div>
      </Sheet>
      <Confirm
        open={wipe}
        onClose={() => setWipe(false)}
        title="Erase everything?"
        body="Keys, chats, circuits, runs and your library will be deleted from this device. Export a backup first if you want to keep anything."
        confirm="Erase everything"
        onConfirm={() => void wipeEverything()}
      />
    </div>
  )
}
