import type { SpotifyTrack } from '../shared/model'

/** Accept only a track's public Spotify URL or URI, never a playlist or an arbitrary host. */
export function parseSpotifyTrackLink(
  value: string,
): { id: string; uri: string; url: string } | null {
  const input = value.trim()
  let id = input.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1]
  if (!id) {
    try {
      const url = new URL(input)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'open.spotify.com' ||
        url.username ||
        url.password ||
        url.port
      )
        return null
      id = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/)?.[1]
    } catch {
      return null
    }
  }
  return id ? { id, uri: `spotify:track:${id}`, url: `https://open.spotify.com/track/${id}` } : null
}

export function manualSpotifyTrack(input: {
  link: string
  title: string
  artists: string
  duration: string
  album: string
}): SpotifyTrack {
  const track = parseSpotifyTrackLink(input.link)
  if (!track)
    throw new Error(
      'Вставь ссылку https://open.spotify.com/track/… или URI spotify:track:… именно на трек.',
    )
  const title = input.title.trim()
  const artists = input.artists
    .split(',')
    .map((artist) => artist.trim())
    .filter(Boolean)
  if (!title || !artists.length) throw new Error('Укажи название и исполнителя выбранного трека.')
  const time = input.duration.trim()
  if (!/^(?:\d{1,2}:[0-5]\d|\d{1,4}):[0-5]\d$/.test(time))
    throw new Error('Укажи длительность в формате м:сс или ч:мм:сс, например 1:29.')
  const duration = time
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0)
  if (!duration) throw new Error('Длительность должна быть больше нуля.')
  return {
    uri: track.uri,
    url: track.url,
    title,
    artists: [...new Set(artists)],
    duration,
    album: input.album.trim(),
  }
}
