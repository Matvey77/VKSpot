import { describe, expect, it } from 'vitest'
import {
  manualSpotifyTrack,
  parseSpotifyTrackLink,
  spotifyTrackId,
} from '../../src/core/spotify-link'

const id = 'a'.repeat(22)
describe('manual Spotify links', () => {
  it.each([
    `https://open.spotify.com/track/${id}?si=shared`,
    `https://open.spotify.com/intl-ru/track/${id}`,
    `https://open.spotify.com/intl-pt-br/track/${id}`,
    `https://open.spotify.com/intl-es-419/track/${id}?si=abc`,
    `https://play.spotify.com/track/${id}`,
    `spotify:track:${id}`,
  ])('normalizes a public track link: %s', (link) => {
    expect(parseSpotifyTrackLink(link)).toEqual({
      id,
      uri: `spotify:track:${id}`,
      url: `https://open.spotify.com/track/${id}`,
    })
  })
  it.each([
    `https://example.com/track/${id}`,
    `https://evil.example/track/${id}`,
    `https://open.spotify.com.evil.test/track/${id}`,
    `https://open.spotify.com/playlist/${id}`,
    `spotify:track:${id}EXTRA`,
    `http://open.spotify.com/track/${id}`,
    `https://user@open.spotify.com/track/${id}`,
    'not a link',
  ])('rejects non-track or untrusted addresses: %s', (link) => {
    expect(parseSpotifyTrackLink(link)).toBeNull()
  })
  it('requires real metadata and duration and stores a canonical, manually confirmed variant', () => {
    const input = {
      link: `spotify:track:${id}`,
      title: ' Worldwide ',
      artists: ' Artist, Guest, Artist ',
      duration: '1:29',
      album: ' Album ',
    }
    expect(manualSpotifyTrack(input)).toMatchObject({
      title: 'Worldwide',
      artists: ['Artist', 'Guest'],
      duration: 89,
      album: 'Album',
      uri: `spotify:track:${id}`,
    })
    expect(manualSpotifyTrack({ ...input, duration: '1:05:00' }).duration).toBe(3900)
    expect(manualSpotifyTrack({ ...input, duration: '24:00:00' }).duration).toBe(86400)
    expect(() => manualSpotifyTrack({ ...input, duration: '24:00:01' })).toThrow('24 часа')
    expect(() => manualSpotifyTrack({ ...input, duration: '9999:59' })).toThrow('24 часа')
    expect(() => manualSpotifyTrack({ ...input, duration: '' })).toThrow('длительность')
    expect(() => manualSpotifyTrack({ ...input, duration: '1:99' })).toThrow('длительность')
    expect(() => manualSpotifyTrack({ ...input, title: ' ' })).toThrow('название')
    expect(() => manualSpotifyTrack({ ...input, artists: '' })).toThrow('исполнителя')
  })

  it('extracts 22-char Spotify track IDs from trusted URIs and URLs only', () => {
    expect(spotifyTrackId('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT')
    expect(spotifyTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
      '4cOdK2wGLETKBW3PvgPWqT',
    )
    expect(spotifyTrackId('https://play.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
      '4cOdK2wGLETKBW3PvgPWqT',
    )
    expect(
      spotifyTrackId('https://open.spotify.com/intl-ru/track/4cOdK2wGLETKBW3PvgPWqT?si=abc'),
    ).toBe('4cOdK2wGLETKBW3PvgPWqT')
    expect(spotifyTrackId('https://open.spotify.com/intl-pt-br/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
      '4cOdK2wGLETKBW3PvgPWqT',
    )
    expect(
      spotifyTrackId('https://open.spotify.com/intl-es-419/track/4cOdK2wGLETKBW3PvgPWqT'),
    ).toBe('4cOdK2wGLETKBW3PvgPWqT')
    expect(spotifyTrackId(`https://evil.example/track/${id}`)).toBeNull()
    expect(spotifyTrackId(`http://open.spotify.com/track/${id}`)).toBeNull()
    expect(spotifyTrackId('')).toBeNull()
    expect(spotifyTrackId(null)).toBeNull()
    expect(spotifyTrackId(undefined)).toBeNull()
    expect(spotifyTrackId('invalid:uri')).toBeNull()
  })
})
