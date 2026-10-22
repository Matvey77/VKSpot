import { describe, expect, it } from 'vitest'
import { manualSpotifyTrack, parseSpotifyTrackLink } from '../../src/core/spotify-link'

const id = 'a'.repeat(22)
describe('manual Spotify links', () => {
  it.each([
    `https://open.spotify.com/track/${id}?si=shared`,
    `https://open.spotify.com/intl-ru/track/${id}`,
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
    expect(() => manualSpotifyTrack({ ...input, duration: '' })).toThrow('длительность')
    expect(() => manualSpotifyTrack({ ...input, duration: '1:99' })).toThrow('длительность')
    expect(() => manualSpotifyTrack({ ...input, title: ' ' })).toThrow('название')
    expect(() => manualSpotifyTrack({ ...input, artists: '' })).toThrow('исполнителя')
  })
})
