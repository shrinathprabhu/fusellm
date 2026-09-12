import { useState } from 'react'
import { BrandMark, Credits, Wordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { Confirm } from '../components/ui'
import { resetVault, unlock } from '../state/app'

export default function Unlock() {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reset, setReset] = useState(false)

  return (
    <main className="unlock">
      <form
        className="unlock-card card"
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const ok = await unlock(pass)
          setBusy(false)
          if (!ok) setError('That passphrase did not open the vault.')
        }}
      >
        <div className="row">
          <BrandMark size={30} />
          <Wordmark />
        </div>
        <h1>Unlock your keys</h1>
        <p className="muted">Your API keys are encrypted on this device. Enter the passphrase to use them this session.</p>
        <label className="field">
          <span className="label">Passphrase</span>
          <input className="input" type="password" autoComplete="current-password" autoFocus value={pass} onChange={e => setPass(e.target.value)} />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary block big" disabled={!pass || busy}>
          <Icon name="unlock" /> {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setReset(true)}>
          Forgot it?
        </button>
      </form>
      <Credits />
      <Confirm
        open={reset}
        onClose={() => setReset(false)}
        title="Reset keys?"
        body="There is no way to recover a forgotten passphrase. Resetting deletes the encrypted keys; your chats, circuits and library stay. You will need to paste your keys again."
        confirm="Delete keys"
        onConfirm={() => void resetVault()}
      />
    </main>
  )
}
