import { fileName, useMediaUrl } from '../lib/media'
import type { MediaRef } from '../types'
import { Icon } from './Icon'

/** One stored image, video or audio clip, with a download link. */
export function MediaTile({ media, onUse }: { media: MediaRef; onUse?: () => void }) {
  const { url, item, missing } = useMediaUrl(media.id)
  if (missing) return <div className="media-tile missing">Removed from this device</div>
  if (!url || !item) return <div className="media-tile loading" aria-busy="true" />
  return (
    <figure className={`media-tile k-${media.kind}`}>
      {media.kind === 'image' && <img src={url} alt={item.prompt.slice(0, 140)} loading="lazy" decoding="async" />}
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
          <a className="icon-btn sm" href={url} download={fileName(item)} aria-label="Download">
            <Icon name="download" />
          </a>
        </span>
      </figcaption>
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
