import type { Collection, PlanItem } from '../../shared/types'

export function makePlan(collection: Collection): PlanItem[] {
  return collection.rows
    .filter((r) => !r.working.excluded)
    .map((r) => {
      const w = r.working
      if (w.destination === 'spotify' && w.spotify)
        return {
          rowId: r.id,
          position: r.position,
          artist: w.artist,
          title: w.title,
          version: w.version,
          destination: 'spotify',
          uri: w.spotify.uri,
          local: null,
        }
      if (w.destination === 'local' && w.local)
        return {
          rowId: r.id,
          position: r.position,
          artist: w.artist,
          title: w.title,
          version: w.version,
          destination: 'local',
          uri: null,
          local: w.local,
        }
      throw new Error(
        `Запись №${r.position} «${w.title}» не готова. Выберите совпадение, локальный файл или отметьте «исключить».`,
      )
    })
}

export function reconcilePrefix(expected: string[], actual: string[]): number {
  if (actual.length > expected.length || actual.some((uri, i) => uri !== expected[i]))
    throw new Error(
      'Состав плейлиста отличается от плана. Автоматическое продолжение остановлено для проверки.',
    )
  return actual.length
}

export function mixedOrder(plan: PlanItem[], actual: string[]): string[] {
  if (actual.length !== plan.length)
    throw new Error(
      `В плейлисте ${actual.length} записей, в плане ${plan.length}. Добавьте все локальные записи, включая повторы, и удалите посторонние записи.`,
    )
  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()
  const decode = (s: string): string | null => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '))
    } catch {
      return null
    }
  }
  const used = new Set<number>()
  return plan.map((item) => {
    const index = actual.findIndex((uri, i) => {
      if (used.has(i)) return false
      if (item.destination === 'spotify') return uri === item.uri
      if (!uri.startsWith('spotify:local:') || !item.local?.title) return false
      const parts = uri.split(':').slice(2)
      if (parts.length !== 4) return false
      const artist = decode(parts[0])
      const title = decode(parts[2])
      if (artist === null || title === null) return false
      const uriDuration = parts[3].trim() === '' ? Number.NaN : Number(parts[3])
      return (
        norm(artist) === norm(item.local.artist) &&
        norm(title) === norm(item.local.title) &&
        item.local.duration !== null &&
        Number.isFinite(uriDuration) &&
        Math.abs(uriDuration - item.local.duration) <= 1
      )
    })
    if (index < 0)
      throw new Error(
        `Не удалось однозначно связать запись №${item.position} с плейлистом. Для локальных файлов нужны корректные теги исполнителя, названия и длительность. Сверьте запись вручную; перестановка не начата.`,
      )
    used.add(index)
    return actual[index]
  })
}
