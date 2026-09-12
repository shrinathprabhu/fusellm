import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { chooseFolder, folderState, forgetFolder, mirrorAll, readFolder, reconnectFolder, type FolderState } from '../lib/folder'
import { persist } from '../lib/db'
import { importData, toast } from '../state/app'

const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`)

/**
 * Where the data lives, how much room there is, and the folder mirror.
 *
 * IndexedDB is not small: Chrome and Edge allow an origin up to about 60% of
 * the disk, Firefox up to 10 GB, Safari asks past about 1 GB. The real risk
 * is eviction, which persistence prevents, and a browser being cleared or
 * replaced, which the folder mirror covers.
 */
export default function StorageCard() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [folder, setFolder] = useState<{ state: FolderState; name?: string }>({ state: 'none' })
  const [busy, setBusy] = useState('')

  const refresh = async () => {
    const est = await navigator.storage?.estimate?.()
    if (est) setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 })
    setPersisted((await navigator.storage?.persisted?.()) ?? null)
    setFolder(await folderState())
  }
  useEffect(() => void refresh(), [])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast(e instanceof Error ? e.message : 'That did not work', 'err')
    } finally {
      setBusy('')
      void refresh()
    }
  }

  return (
    <section className="card pad stack">
      <h2 className="section-title">Storage</h2>
      {usage && (
        <div className="storage-bar" title={`${mb(usage.used)} of ${mb(usage.quota)}`}>
          <div className="fill" style={{ width: `${Math.max(1, Math.min(100, (usage.used / Math.max(1, usage.quota)) * 100))}%` }} />
          <span className="mono tiny">
            {mb(usage.used)} used of about {mb(usage.quota)} this browser allows
          </span>
        </div>
      )}
      <p className="small muted">
        Chats, circuits, runs, the library and generated media are kept in this browser’s IndexedDB.{' '}
        {persisted ? 'The browser has agreed not to clear them when space runs low.' : 'Ask the browser to keep them even when space runs low.'}
      </p>
      {persisted === false && (
        <button type="button" className="btn small" onClick={async () => setPersisted(await persist())}>
          <Icon name="shield" /> Keep data persistent
        </button>
      )}

      <hr className="divider" />
      <h3 className="sub-title">Mirror to a folder on this computer</h3>
      {folder.state === 'unsupported' ? (
        <p className="small muted">This browser cannot write to folders. Chrome, Edge, Brave, Arc and Opera on desktop can. Use Export backup below instead.</p>
      ) : folder.state === 'none' ? (
        <>
          <p className="small muted">
            Pick a folder and FuseLLM writes every chat, circuit, run and generated file into it as JSON, Markdown and media files, as you work. It survives clearing the browser, backs up with anything, and loads into another browser. API keys are never
            written there.
          </p>
          <button
            type="button"
            className="btn small primary"
            disabled={!!busy}
            onClick={() =>
              run('connect', async () => {
                const name = await chooseFolder()
                const n = await mirrorAll()
                toast(`Mirroring to ${name}: ${n} items written`)
              })
            }
          >
            <Icon name="library" /> Choose a folder
          </button>
        </>
      ) : (
        <>
          <p className="small">
            {folder.state === 'ready' ? <span className="badge ok">mirroring</span> : <span className="badge warn">needs permission</span>} Folder <strong>{folder.name}</strong>
          </p>
          <div className="row wrap">
            {folder.state === 'prompt' && (
              <button type="button" className="btn small primary" disabled={!!busy} onClick={() => run('reconnect', async () => void ((await reconnectFolder()) && toast('Folder reconnected')))}>
                Allow access again
              </button>
            )}
            {folder.state === 'ready' && (
              <>
                <button type="button" className="btn small" disabled={!!busy} onClick={() => run('sync', async () => toast(`Wrote ${await mirrorAll()} items`))}>
                  <Icon name="refresh" /> {busy === 'sync' ? 'Writing…' : 'Write everything now'}
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!!busy}
                  onClick={() =>
                    run('load', async () => {
                      const d = await readFolder()
                      toast((await importData({ app: 'FuseLLM', version: 1, chats: d.chats, circuits: d.circuits, runs: d.runs } as never)) + (d.media ? ` Plus ${d.media} media files.` : ''))
                    })
                  }
                >
                  <Icon name="upload" /> {busy === 'load' ? 'Loading…' : 'Load from folder'}
                </button>
              </>
            )}
            <button type="button" className="btn small ghost" disabled={!!busy} onClick={() => run('forget', async () => void (await forgetFolder(), toast('Stopped mirroring. The folder and its files are untouched.')))}>
              Stop mirroring
            </button>
          </div>
        </>
      )}
    </section>
  )
}
