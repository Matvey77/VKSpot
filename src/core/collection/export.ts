import { stringify } from 'csv-stringify/sync'
import type { Collection } from '../../shared/model'
import { makePlan } from './transfer-plan'

export function csvExport(collection: Collection): string {
  return (
    '\uFEFF' +
    stringify(
      collection.rows.map((r) => ({
        position: r.position,
        vk_id: r.source.id,
        source_artist: r.source.artist,
        source_title: r.source.title,
        duration: r.source.duration ?? '',
        availability: r.source.availability,
        artist: r.working.artist,
        title: r.working.title,
        version: r.working.version,
        excluded: r.working.excluded,
        destination: r.working.destination,
        spotify_uri: r.working.spotify?.uri ?? '',
        local_path: r.working.local?.path ?? '',
        note: r.working.note,
      })),
      { header: true, quoted: true },
    )
  )
}

export function exportText(collection: Collection, format: string): string {
  if (format === 'archive')
    return JSON.stringify({ format: 'vkspot', version: 1, collection }, null, 2)
  if (format === 'raw-json')
    return JSON.stringify(
      {
        format: 'vkspot-raw',
        sourceHash: collection.sourceHash,
        completeness: collection.completeness,
        tracks: collection.rows.map((r) => ({ position: r.position, ...r.source })),
      },
      null,
      2,
    )
  if (format === 'csv') return csvExport(collection)
  const plan = makePlan(collection)
  if (format === 'plan')
    return JSON.stringify(
      {
        format: 'vkspot-plan',
        version: 1,
        name: collection.name,
        sourceHash: collection.sourceHash,
        items: plan,
      },
      null,
      2,
    )
  return (
    '#EXTM3U\n' +
    plan
      .map(
        (r) =>
          `#EXTINF:${r.local?.duration ?? -1},${r.artist.replace(/[\r\n]/g, ' ')} - ${r.title.replace(/[\r\n]/g, ' ')}\n${r.local?.path ?? r.uri}`,
      )
      .join('\n') +
    '\n'
  )
}
