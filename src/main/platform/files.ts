import { app, BrowserWindow, dialog, shell } from 'electron'
import { join, extname, basename } from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { parseFile } from 'music-metadata'
import type { Store } from '../storage'
import { exportText, parseImport } from '../../core/collection'
import type { ImportPreview } from '../../shared/model'

const uuid = z.string().uuid()
const exec = promisify(execFile)

export const localExtensions = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.opus',
  '.aiff',
  '.wma',
])

export function resolveResource(path: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scripts', path)
    : join(app.getAppPath(), 'resources', 'scripts', path)
}

export function openExternalSafely(url: unknown): Promise<void> {
  const value = z.string().url().parse(url)
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    ![
      'open.spotify.com',
      'developer.spotify.com',
      'support.spotify.com',
      'vk.com',
      'vk.ru',
      'accounts.spotify.com',
    ].includes(parsed.hostname)
  ) {
    throw new Error('Эта внешняя ссылка не разрешена.')
  }
  return shell.openExternal(value)
}

export async function previewImportDialog(main: BrowserWindow): Promise<ImportPreview | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(main, {
    title: 'Импортировать список или архив',
    properties: ['openFile'],
    filters: [{ name: 'Список музыки', extensions: ['json', 'csv', 'txt'] }],
  })
  if (canceled) return null
  return parseImport(
    await fs.readFile(filePaths[0], 'utf8'),
    extname(filePaths[0]),
    basename(filePaths[0], extname(filePaths[0])),
  )
}

export async function exportCollectionDialog(
  main: BrowserWindow,
  store: Store,
  id: unknown,
  format: unknown,
): Promise<string | null> {
  const collection = store.get(uuid.parse(id))
  const f = z.enum(['archive', 'raw-json', 'csv', 'm3u8', 'plan']).parse(format)
  const text = exportText(collection, f)
  const extension = f === 'csv' ? 'csv' : f === 'm3u8' ? 'm3u8' : 'json'
  const result = await dialog.showSaveDialog(main, {
    defaultPath: `${collection.name.replace(/[<>:"/\\|?*]/g, '_')}-${f}.${extension}`,
    filters: [{ name: 'VKSpot', extensions: [extension] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, text, 'utf8')
  return result.filePath
}

export async function linkFileDialog(
  main: BrowserWindow,
  store: Store,
  id: unknown,
  rowId: unknown,
): Promise<void> {
  const collectionId = uuid.parse(id)
  const entryId = uuid.parse(rowId)
  if (!store.get(collectionId).rows.some((r) => r.id === entryId)) {
    throw new Error('Запись не найдена.')
  }
  const result = await dialog.showOpenDialog(main, {
    properties: ['openFile'],
    filters: [{ name: 'Аудио', extensions: [...localExtensions].map((s) => s.slice(1)) }],
  })
  if (result.canceled) return
  const path = result.filePaths[0]
  const stat = await fs.stat(path)
  if (!localExtensions.has(extname(path).toLowerCase())) {
    throw new Error('Выберите аудиофайл поддерживаемого формата.')
  }
  const metadata = await parseFile(path)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  store.patch(collectionId, [entryId], {
    local: {
      path,
      sha256: hash.digest('hex'),
      artist: metadata.common.artist ?? '',
      title: metadata.common.title ?? '',
      duration: metadata.format.duration ?? null,
      codec: metadata.format.codec ?? metadata.format.container ?? '',
      bitrate: metadata.format.bitrate ?? null,
      size: stat.size,
    },
    destination: 'local',
  })
}

export async function prepareLocalDialog(
  main: BrowserWindow,
  store: Store,
  id: unknown,
): Promise<string | null> {
  const collection = store.get(uuid.parse(id))
  const plan = collection.rows.map((row) => ({
    rowId: row.id,
    position: row.position,
    artist: row.working.artist,
    title: row.working.title,
    version: row.working.version,
    excluded: row.working.excluded,
    destination: row.working.destination,
    uri: row.working.spotify?.uri ?? null,
    local: row.working.local,
  }))
  const local = plan.filter((p) => !p.excluded && p.destination === 'local' && p.local)
  if (!local.length) throw new Error('В плане нет локальных файлов.')
  const choice = await dialog.showOpenDialog(main, {
    title: 'Папка для копии локальных файлов',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (choice.canceled) return null
  const folder = join(choice.filePaths[0], `VKSpot-${collection.id.slice(0, 8)}`)
  await fs.mkdir(folder, { recursive: true })
  const manifest = []
  for (const item of local) {
    const file = item.local!
    const extension = extname(file.path).toLowerCase()
    if (!localExtensions.has(extension)) {
      throw new Error('В архиве указан неподдерживаемый локальный файл.')
    }
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(file.path)) hash.update(chunk)
    if (hash.digest('hex') !== file.sha256) {
      throw new Error(`Файл записи №${item.position} изменился. Привяжите его заново.`)
    }
    const filename = `${String(item.position).padStart(6, '0')}-${item.rowId.slice(0, 8)}${extension}`
    const target = join(folder, filename)
    try {
      await fs.copyFile(file.path, target, 1)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const existing = createHash('sha256')
      for await (const chunk of createReadStream(target)) existing.update(chunk)
      if (existing.digest('hex') !== file.sha256) {
        throw new Error('В папке уже есть другой файл с этим именем. Выберите новую папку.', {
          cause: e,
        })
      }
    }
    manifest.push({ ...item, preparedPath: target })
  }
  await fs.writeFile(
    join(folder, 'transfer-plan.json'),
    JSON.stringify(
      {
        format: 'vkspot-local-bundle',
        version: 1,
        sourceHash: collection.sourceHash,
        fullPlan: plan,
        local: manifest,
      },
      null,
      2,
    ),
  )
  await fs.writeFile(
    join(folder, 'local.m3u8'),
    '#EXTM3U\n' +
      manifest
        .map(
          (p) =>
            `#EXTINF:${p.local?.duration ?? -1},${p.artist.replace(/[\r\n]/g, ' ')} - ${p.title.replace(/[\r\n]/g, ' ')}\n${basename(p.preparedPath)}`,
        )
        .join('\n'),
  )
  await fs.writeFile(
    join(folder, 'READ_ME.txt'),
    'VKSpot: файлы скопированы без перекодирования. Исходные файлы не изменены.\nПодключите эту папку в настройках Spotify → Локальные файлы. Добавьте записи в плейлист. transfer-plan.json содержит полный смешанный порядок.\nИмена файлов обозначают позиции; они не заменяют встроенные теги. Мобильное устройство требует отдельной копии файлов.\n',
  )
  return folder
}

export async function executeSpotifyHelper(action: unknown): Promise<string> {
  const a = z.enum(['inspect', 'open-spotify']).parse(action)
  if (a === 'open-spotify') {
    try {
      await shell.openExternal('spotify:')
      return 'Spotify открыт.'
    } catch (error) {
      throw new Error('Не удалось открыть Spotify. Установите настольное приложение Spotify.', {
        cause: error,
      })
    }
  }
  if (process.platform !== 'win32') {
    throw new Error('Системный помощник этой сборки доступен только на Windows.')
  }
  const result = await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolveResource('windows/spotify-helper.ps1'),
      '-Action',
      a,
    ],
    { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
  )
  return result.stdout
}
