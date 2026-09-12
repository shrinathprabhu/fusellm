/**
 * A small video editor that runs in the page: no server, no ffmpeg.wasm.
 *
 * Clips (videos, or still images shown with a slow push-in) are laid out on
 * a timeline and drawn to a canvas, with cuts, crossfades or dips to black
 * between them and optional title cards at both ends. Narration, a music bed
 * and the clips' own sound are mixed in WebAudio: music sits under the voice
 * and fades out at the end. The canvas and the mix are recorded together with
 * MediaRecorder, as MP4 where the browser can, otherwise WebM.
 *
 * It renders in real time, so a two-minute film takes about two minutes, and
 * the tab must stay visible: browsers pause drawing in background tabs.
 */

export interface Clip {
  blob: Blob
  kind: 'video' | 'image'
  /** Seconds a still image stays on screen; videos use their own length. */
  hold?: number
}

export type Transition = 'cut' | 'crossfade' | 'fade'

export interface AssembleOptions {
  clips: Clip[]
  narration?: Blob
  music?: Blob
  transition: Transition
  transitionSec: number
  openTitle?: string
  closeTitle?: string
  width: number
  height: number
  fps: number
  musicVolume: number
  narrationVolume: number
  clipVolume: number
  signal: AbortSignal
  onProgress: (fraction: number, label: string) => void
}

const TITLE_SEC = 2.8

interface Placed {
  clip: Clip
  el: HTMLVideoElement | HTMLImageElement
  url: string
  start: number
  dur: number
  started?: boolean
}

function pickMime(): string {
  const options = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return options.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? 'video/webm'
}

function load(clip: Clip): Promise<{ el: HTMLVideoElement | HTMLImageElement; url: string; dur: number }> {
  const url = URL.createObjectURL(clip.blob)
  if (clip.kind === 'image') {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ el: img, url, dur: clip.hold ?? 4 })
      img.onerror = () => reject(new Error('An image could not be read.'))
      img.src = url
    })
  }
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.playsInline = true
    v.crossOrigin = 'anonymous'
    v.onloadedmetadata = () => resolve({ el: v, url, dur: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : clip.hold ?? 5 })
    v.onerror = () => reject(new Error('A video clip could not be decoded by this browser.'))
    v.src = url
  })
}

/** Draws media to fill the frame, cropping the overflow (object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, el: CanvasImageSource & { videoWidth?: number; naturalWidth?: number }, W: number, H: number, zoom = 1) {
  const w = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || W
  const h = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || H
  const s = Math.max(W / w, H / h) * zoom
  ctx.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s)
}

function title(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#0d0e11'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#f3efe6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const size = Math.round(H / 12)
  ctx.font = `700 ${size}px Geist, system-ui, sans-serif`
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > W * 0.8 && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  lines.slice(0, 4).forEach((l, i, all) => ctx.fillText(l, W / 2, H / 2 + (i - (all.length - 1) / 2) * size * 1.25))
  ctx.restore()
}

export async function assemble(o: AssembleOptions): Promise<Blob> {
  if (!o.clips.length) throw new Error('There are no clips to assemble.')
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video (no MediaRecorder).')
  o.onProgress(0, 'Loading clips')
  const loaded = await Promise.all(o.clips.map(load))

  // Timeline: clips overlap by the transition length when crossfading.
  const T = o.transition === 'cut' ? 0 : Math.max(0.2, Math.min(o.transitionSec, 2))
  const overlap = o.transition === 'crossfade' ? T : 0
  let t = o.openTitle ? TITLE_SEC : 0
  const placed: Placed[] = loaded.map((l, i) => {
    const p = { clip: o.clips[i], el: l.el, url: l.url, start: t, dur: l.dur }
    t += l.dur - (i < loaded.length - 1 ? overlap : 0)
    return p
  })
  const filmEnd = t
  const total = filmEnd + (o.closeTitle ? TITLE_SEC : 0)

  const canvas = document.createElement('canvas')
  canvas.width = o.width
  canvas.height = o.height
  const ctx = canvas.getContext('2d', { alpha: false })!

  // The mix: every source goes to one recording destination, none to speakers.
  const ac = new AudioContext()
  const dest = ac.createMediaStreamDestination()
  const decode = async (b?: Blob) => (b ? ac.decodeAudioData(await b.arrayBuffer()) : undefined)
  const [narr, music] = await Promise.all([decode(o.narration), decode(o.music)])
  for (const p of placed) {
    if (p.el instanceof HTMLVideoElement) {
      const g = ac.createGain()
      g.gain.value = o.clipVolume * (narr ? 0.5 : 1)
      ac.createMediaElementSource(p.el).connect(g).connect(dest)
    }
  }

  const stream = canvas.captureStream(o.fps)
  for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr)
  const mime = pickMime()
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = e => e.data.size && chunks.push(e.data)
  const stopped = new Promise<void>(resolve => (rec.onstop = () => resolve()))

  await ac.resume()
  const t0 = ac.currentTime + 0.15
  if (narr) {
    const src = ac.createBufferSource()
    src.buffer = narr
    const g = ac.createGain()
    g.gain.value = o.narrationVolume
    src.connect(g).connect(dest)
    src.start(t0 + (o.openTitle ? TITLE_SEC * 0.6 : 0))
  }
  if (music) {
    const src = ac.createBufferSource()
    src.buffer = music
    src.loop = music.duration < total
    const g = ac.createGain()
    const level = o.musicVolume * (narr ? 0.45 : 1)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(level, t0 + 1.2)
    g.gain.setValueAtTime(level, t0 + Math.max(1.2, total - 2.5))
    g.gain.linearRampToValueAtTime(0, t0 + total)
    src.connect(g).connect(dest)
    src.start(t0)
    src.stop(t0 + total + 0.1)
  }

  rec.start(500)
  const started = performance.now()
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Stopped', 'AbortError'))
    o.signal.addEventListener('abort', onAbort, { once: true })
    const frame = () => {
      if (o.signal.aborted) return
      const now = (performance.now() - started) / 1000
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, o.width, o.height)

      for (const p of placed) {
        const local = now - p.start
        if (local < 0 || local > p.dur) {
          if (p.el instanceof HTMLVideoElement && p.started && !p.el.paused) p.el.pause()
          continue
        }
        if (p.el instanceof HTMLVideoElement && !p.started) {
          p.started = true
          p.el.currentTime = 0
          void p.el.play().catch(() => {})
        }
        let alpha = 1
        if (o.transition === 'crossfade') {
          const i = placed.indexOf(p)
          if (i > 0 && local < T) alpha = local / T
        } else if (o.transition === 'fade') {
          alpha = Math.min(1, local / (T / 2), (p.dur - local) / (T / 2))
        }
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
        // Stills get a gentle push-in so they read as footage.
        cover(ctx, p.el, o.width, o.height, p.clip.kind === 'image' ? 1 + 0.08 * (local / p.dur) : 1)
        ctx.restore()
      }
      if (o.openTitle && now < TITLE_SEC) title(ctx, o.openTitle, o.width, o.height, Math.min(1, (TITLE_SEC - now) / 0.6))
      if (o.closeTitle && now > filmEnd) title(ctx, o.closeTitle, o.width, o.height, Math.min(1, (now - filmEnd) / 0.6))

      o.onProgress(Math.min(1, now / total), `Rendering ${Math.floor(now)}s of ${Math.ceil(total)}s`)
      if (now >= total) return resolve()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }).finally(() => {
    if (rec.state !== 'inactive') rec.stop()
    for (const p of placed) {
      if (p.el instanceof HTMLVideoElement) p.el.pause()
      URL.revokeObjectURL(p.url)
    }
  })
  await stopped
  void ac.close()
  o.onProgress(1, 'Finishing')
  return new Blob(chunks, { type: mime.split(';')[0] })
}
