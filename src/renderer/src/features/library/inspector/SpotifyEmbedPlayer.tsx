export function SpotifyEmbedPlayer({
  trackId,
  title,
  className,
  bare = false,
}: {
  trackId: string
  title: string
  className?: string
  bare?: boolean
}) {
  const iframe = (
    <iframe
      className={className}
      src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
      width="100%"
      height="152"
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      title={title}
    />
  )

  if (bare) return iframe
  return <div className="spotify-embed-card">{iframe}</div>
}
