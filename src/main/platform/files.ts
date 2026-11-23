import { app, BrowserWindow, dialog, shell } from 'electron'
import { basename, dirname, extname, join } from 'node:path'
import { constants as fsConstants, createReadStream, promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { Store } from '../storage'
import { exportText, parseImport } from '../../core/collection'
import { exportFormatSchema, type ImportPreview } from '../../shared/model'

const uuid = z.string().uuid()
const exec = promisify(execFile)
const MAX_IMPORT_BYTES = 100 * 1024 * 1024

async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = join(
    dirname(filePath),
    `.${basename(filePath)}.tmp-${process.pid}-${randomUUID()}`,
  )
  try {
    await fs.writeFile(tempPath, content, 'utf8')
    await fs.rename(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

function sanitizeHelperError(error: unknown): Error {
  const err = error as NodeJS.ErrnoException & {
    killed?: boolean
    signal?: string | null
    stderr?: string | Buffer
  }
  if (err?.killed || err?.signal === 'SIGTERM' || err?.code === 'ETIMEDOUT') {
    return new Error('Системный помощник не ответил вовремя. Повтори проверку.', { cause: error })
  }
  const rawStderr =
    typeof err?.stderr === 'string'
      ? err.stderr
      : Buffer.isBuffer(err?.stderr)
        ? err.stderr.toString('utf8')
        : ''
  let text = rawStderr
  if (text.includes('#< CLIXML')) {
    const errorLines = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) =>
      m[1].replace(/_x000D__x000A_/g, '\n').replace(/<[^>]+>/g, ''),
    )
    text = errorLines.join('\n')
  }
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith('At ') &&
        !line.startsWith('строка:') &&
        !line.startsWith('+') &&
        !line.startsWith('CategoryInfo') &&
        !line.startsWith('FullyQualifiedErrorId'),
    )
  const russianLine = firstLine && /[А-Яа-яЁё]/.test(firstLine) ? firstLine : ''
  return new Error(russianLine || 'Не удалось выполнить системную проверку Spotify.', {
    cause: error,
  })
}

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
    parsed.username ||
    parsed.password ||
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
  return shell.openExternal(parsed.href)
}

export async function previewImportDialog(main: BrowserWindow): Promise<ImportPreview | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(main, {
    title: 'Импортировать список или архив',
    properties: ['openFile'],
    filters: [{ name: 'Список музыки', extensions: ['json', 'csv', 'txt'] }],
  })
  if (canceled) return null
  const filePath = filePaths[0]
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) {
    throw new Error('Выбери обычный файл для импорта.')
  }
  if (stat.size > MAX_IMPORT_BYTES) {
    throw new Error('Файл слишком большой для импорта (максимум 100 МБ).')
  }
  return parseImport(
    await fs.readFile(filePath, 'utf8'),
    extname(filePath),
    basename(filePath, extname(filePath)),
  )
}

export async function exportCollectionDialog(
  main: BrowserWindow,
  store: Store,
  id: unknown,
  format: unknown,
): Promise<string | null> {
  const collection = store.get(uuid.parse(id))
  const f = exportFormatSchema.parse(format)
  const text = exportText(collection, f)
  const extension = f === 'csv' ? 'csv' : f === 'm3u8' ? 'm3u8' : 'json'
  const result = await dialog.showSaveDialog(main, {
    defaultPath: `${collection.name.replace(/[<>:"/\\|?*]/g, '_')}-${f}.${extension}`,
    filters: [{ name: 'VKSpot', extensions: [extension] }],
  })
  if (result.canceled || !result.filePath) return null
  await writeFileAtomically(result.filePath, text)
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
  const stat = await fs.lstat(path)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Выбери обычный аудиофайл, а не символическую ссылку или папку.')
  }
  if (!localExtensions.has(extname(path).toLowerCase())) {
    throw new Error('Выбери аудиофайл поддерживаемого формата.')
  }
  const { parseFile } = await import('music-metadata')
  const metadata = await parseFile(path, { skipCovers: true })
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
  const plan = collection.rows
    .filter((r) => !r.working.excluded)
    .map((r) => ({
      rowId: r.id,
      position: r.position,
      artist: r.working.artist,
      title: r.working.title,
      version: r.working.version,
      destination: r.working.destination,
      uri: r.working.destination === 'spotify' ? (r.working.spotify?.uri ?? null) : null,
      local: r.working.destination === 'local' ? r.working.local : null,
    }))
  const local = plan.filter((p) => p.destination === 'local' && p.local)
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
    let stat
    try {
      stat = await fs.lstat(file.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Файл записи №${item.position} не найден. Привяжи его заново.`, {
          cause: error,
        })
      }
      throw error
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(
        `Файл записи №${item.position} недоступен или является символической ссылкой. Привяжи его заново.`,
      )
    }
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(file.path)) hash.update(chunk)
    if (hash.digest('hex') !== file.sha256) {
      throw new Error(`Файл записи №${item.position} изменился. Привяжи его заново.`)
    }
    const filename = `${String(item.position).padStart(6, '0')}-${item.rowId.slice(0, 8)}${extension}`
    const target = join(folder, filename)
    try {
      await fs.copyFile(file.path, target, fsConstants.COPYFILE_EXCL)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const existing = createHash('sha256')
      for await (const chunk of createReadStream(target)) existing.update(chunk)
      if (existing.digest('hex') !== file.sha256) {
        throw new Error('В папке уже есть другой файл с этим именем. Выбери новую папку.', {
          cause: e,
        })
      }
    }
    manifest.push({ ...item, preparedPath: target })
  }
  await writeFileAtomically(
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
  await writeFileAtomically(
    join(folder, 'local.m3u8'),
    '#EXTM3U\n' +
      manifest
        .map((p) => {
          const duration = p.local?.duration != null ? Math.round(p.local.duration) : -1
          return `#EXTINF:${duration},${p.artist.replace(/[\r\n]/g, ' ')} - ${p.title.replace(/[\r\n]/g, ' ')}\n${basename(p.preparedPath)}`
        })
        .join('\n') +
      '\n',
  )
  await writeFileAtomically(
    join(folder, 'READ_ME.txt'),
    'VKSpot: файлы скопированы без перекодирования. Исходные файлы не изменены.\nПодключи эту папку в настройках Spotify → Локальные файлы. Добавь записи в плейлист. transfer-plan.json содержит полный смешанный порядок.\nИмена файлов обозначают позиции; они не заменяют встроенные теги. Мобильное устройство требует отдельной копии файлов.\n',
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
      throw new Error('Не удалось открыть Spotify. Установи настольное приложение Spotify.', {
        cause: error,
      })
    }
  }
  if (process.platform !== 'win32') {
    throw new Error('Системный помощник этой сборки доступен только на Windows.')
  }
  try {
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
  } catch (error) {
    throw sanitizeHelperError(error)
  }
}
