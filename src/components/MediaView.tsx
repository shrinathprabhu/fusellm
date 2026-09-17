import { useState } from 'react'
import { fileName, useMediaUrl, type MediaItem } from '../lib/media'
import type { MediaRef } from '../types'
import { Lightbox, MediaPlayer, type ViewSource } from './FileViewer'
import { Icon } from './Icon'

/** A stored item as something the viewers can open, keeping its notes with it. */
export function mediaSource(item: MediaItem): ViewSource {
  return { type: 'blob', name: fileName(item), blob: item.blob, mediaId: item.id }
}

/** One stored image, video or audio clip, with a download link. */
export function MediaTile({ media, onUse }: { media: MediaRef; onUse?: () => void }) {
  const { url, item, missing } = useMediaUrl(media.id)
  const [open, setOpen] = useState(false)
  if (missing) return <div className="media-tile missing">Removed from this device</div>
  if (!url || !item) return <div className="media-tile loading" aria-busy="true" />
  return (
    <figure className={`media-tile k-${media.kind}`}>
      {media.kind === 'image' && <img className="media-open" src={url} alt={item.prompt.slice(0, 140)} loading="lazy" decoding="async" onClick={() => setOpen(true)} />}
      {media.kind === 'video' && <video src={url} controls playsInline preload="metadata" />}
      {media.kind === 'audio' && <audio src={url} controls preload="metadata" />}
      <figcaption>
        <span className="media-prompt" title={item.prompt}>
          {item.prompt}
        </span>
        <span className="media-actions">
          {onUse && media.kind === 'image' && (
            <button type="button" className="icon-btn sm" onClick={onUse} aria-label="Use as reference">
              <Icon name="refresh" />
            </button>
          )}
          <button type="button" className="icon-btn sm" onClick={() => setOpen(true)} aria-label="Open in viewer" title={media.kind === 'image' ? 'Open' : 'Open in the player, with notes'}>
            <Icon name="expand" />
          </button>
          <a className="icon-btn sm" href={url} download={fileName(item)} aria-label="Download">
            <Icon name="download" />
          </a>
        </span>
      </figcaption>
      <Lightbox source={open ? mediaSource(item) : null} onClose={() => setOpen(false)} />
    </figure>
  )
}

export function MediaGrid({ media, onUse }: { media: MediaRef[]; onUse?: (m: MediaRef) => void }) {
  if (!media.length) return null
  return (
    <div className="media-grid">
      {media.map(m => (
        <MediaTile key={m.id} media={m} onUse={onUse ? () => onUse(m) : undefined} />
      ))}
    </div>
  )
}

/** A full player for a stored video or audio clip, for the headline output of a run. */
export function MediaFeature({ media }: { media: MediaRef }) {
  const { item, missing } = useMediaUrl(media.id)
  if (missing) return <div className="media-tile missing">Removed from this device</div>
  if (!item) return <div className="viewer-loading" aria-busy="true" />
  if (item.kind !== 'video' && item.kind !== 'audio') return <MediaTile media={media} />
  return <MediaPlayer blob={item.blob} kind={item.kind} name={fileName(item)} notesKey={item.id} />
}
