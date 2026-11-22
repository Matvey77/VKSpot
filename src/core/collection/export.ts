import { stringify } from 'csv-stringify/sync'
import type { Collection, ExportFormat } from '../../shared/types'
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

export function exportText(collection: Collection, format: ExportFormat): string {
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
  if (format === 'plan') {
    const plan = makePlan(collection)
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
  }
  if (format === 'm3u8') {
    const plan = makePlan(collection)
    const clean = (value: string) => value.replace(/[\r\n]/g, ' ')
    return (
      '#EXTM3U\n' +
      plan
        .map((r) => {
          const duration = r.local?.duration != null ? Math.round(r.local.duration) : -1
          const version = clean(r.version).trim()
          const displayTitle = version ? `${clean(r.title)} (${version})` : clean(r.title)
          const target = clean(r.local?.path ?? r.uri ?? '')
          return `#EXTINF:${duration},${clean(r.artist)} - ${displayTitle}\n${target}`
        })
        .join('\n') +
      '\n'
    )
  }
  const exhaustive: never = format
  throw new Error(`Неизвестный формат экспорта: ${String(exhaustive)}.`)
}
