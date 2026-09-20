import { useState } from 'react'
import type { Attachment } from '../types'
import { attachmentBlob } from '../lib/attachments'
import { bytes } from '../lib/format'
import { Icon } from './Icon'
import { Lightbox, type ViewSource } from './FileViewer'

export function Attachments({ files, onRemove }: { files: Attachment[]; onRemove?: (id: string) => void }) {
  const [view, setView] = useState<ViewSource | null>(null)
  if (!files.length) return null
  return <div className="attachments" aria-label="Attached files">
    {files.map(file => <div className="attachment" key={file.id}>
      <button type="button" className="attachment-open" onClick={() => setView({ type: 'blob', name: file.name, blob: attachmentBlob(file) })} title={`Open or download ${file.name}`}>
        <Icon name={file.kind === 'image' ? 'image' : file.kind === 'audio' ? 'music' : 'file'} />
        <span><strong>{file.name}</strong><span className="hint">{bytes(file.size)} · {file.kind === 'unsupported' ? 'Cannot read this format' : file.kind}</span></span>
      </button>
      {onRemove && <button type="button" className="icon-btn sm" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}><Icon name="x" /></button>}
      {file.note && <p className="hint attachment-note">{file.note}</p>}
    </div>)}
    <Lightbox source={view} onClose={() => setView(null)} />
  </div>
}
