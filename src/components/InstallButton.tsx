import { useState } from 'react'
import { installApp, useInstall } from '../lib/install.ts'
import { Icon } from './Icon.tsx'
import { Sheet } from './ui.tsx'

export function InstallButton() {
  const { installed, prompting } = useInstall()
  const [help, setHelp] = useState(false)
  const label = installed ? 'App installed' : prompting ? 'Installing…' : 'Install app'
  return (
    <>
      <button type="button" className="btn small install-button" aria-label={label} title={label} disabled={installed || prompting}
        onClick={async () => { if (await installApp() === 'instructions') setHelp(true) }}>
        <Icon name={installed ? 'check' : 'install'} />
        <span>{label}</span>
      </button>
      <Sheet open={help} onClose={() => setHelp(false)} title="Install FuseLLM">
        <div className="stack install-help">
          <p>Keep FuseLLM in its own window and open your saved work offline. Running AI models still needs an internet connection.</p>
          <p><strong>iPhone or iPad:</strong> Open this page in Safari, tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add.</p>
          <p><strong>Mac with Safari:</strong> Choose File → Add to Dock.</p>
          <p><strong>Chrome or Edge:</strong> Look for the install icon in the address bar, or Install app in the browser menu. If it is not available yet, let this page finish loading and try again.</p>
          <p className="small muted">If your browser does not offer installation, open this page in a browser that does. There is no separate installer file to download.</p>
        </div>
      </Sheet>
    </>
  )
}
