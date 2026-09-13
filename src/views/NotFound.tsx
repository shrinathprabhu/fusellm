export default function NotFound({ item }: { item?: string }) {
  return (
    <div className="page not-found">
      <p className="eyebrow">404 · Nothing wired here</p>
      <h1>{item ? `${item} not found` : 'This link leads to a loose end.'}</h1>
      <p className="lede">{item ? 'It may have been deleted, or saved on another browser or device. Your work stays on the device where you created it.' : 'The page may have moved, or the address may have a typo. Pick up a new thread from here.'}</p>
      <div className="hero-cta">
        <a className="btn primary" href="/">Back to home</a>
        <a className="btn" href="/chat">Start a chat</a>
      </div>
    </div>
  )
}
