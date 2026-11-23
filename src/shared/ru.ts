/** Shared Russian pluralization, number formatting and human-readable error helpers (Zod-free). */

export function pluralize(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count))
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  const mod10 = n % 10
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

export function formatCount(count: number): string {
  return count.toLocaleString('ru-RU')
}

/** Nominative / accusative: "1 запись", "2 записи", "5 записей". */
export function formatRecordsCount(count: number): string {
  return `${formatCount(count)} ${pluralize(count, ['запись', 'записи', 'записей'])}`
}

/** Genitive: "1 записи", "2 записей", "5 записей" (e.g. "из 1 записи", "у 2 записей"). */
export function formatRecordsGenitive(count: number): string {
  return `${formatCount(count)} ${pluralize(count, ['записи', 'записей', 'записей'])}`
}

/** Nominative / accusative for Spotify tracks: "1 трек", "2 трека", "5 треков". */
export function formatTracksCount(count: number): string {
  return `${formatCount(count)} ${pluralize(count, ['трек', 'трека', 'треков'])}`
}

/** Nominative for collections: "1 коллекция", "2 коллекции", "5 коллекций". */
export function formatCollectionsCount(count: number): string {
  return `${formatCount(count)} ${pluralize(count, ['коллекция', 'коллекции', 'коллекций'])}`
}

const CYRILLIC_RE = /[А-Яа-яЁё]/

const NETWORK_ERROR_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_NO_SUPPORTED_PROXIES|ERR_PROXY_AUTH_REQUESTED|ERR_MANDATORY_PROXY_CONFIGURATION_FAILED|ERR_SOCKS_CONNECTION_FAILED/i,
    'Не удалось подключиться через прокси. Проверь адрес прокси и его работу.',
  ],
  [
    /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE/i,
    'Нет подключения к интернету. Проверь сеть и повтори попытку.',
  ],
  [
    /ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i,
    'Не удалось найти адрес сервера. Проверь интернет, DNS или настройки прокси.',
  ],
  [
    /ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|TimeoutError|aborted due to timeout|timed out/i,
    'Сервер не ответил вовремя. Проверь сеть или прокси и повтори попытку.',
  ],
  [
    /ERR_CONNECTION_REFUSED|ECONNREFUSED/i,
    'Сервер или прокси отклонил соединение. Проверь адрес и порт.',
  ],
  [
    /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ECONNRESET/i,
    'Соединение было прервано. Проверь сеть или прокси и повтори попытку.',
  ],
  [
    /ERR_CERT_|ERR_SSL_|CERT_|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i,
    'Ошибка защищённого соединения (TLS/SSL). Проверь дату на компьютере и настройки прокси.',
  ],
  [/ERR_ABORTED|AbortError/i, 'Запрос был прерван до завершения. Повтори попытку.'],
]

export function stripIpcErrorPrefix(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
}

export function humanizeNetworkError(
  error: unknown,
  fallback = 'Сетевая ошибка. Проверь подключение к интернету или настройки прокси.',
): string {
  const raw = stripIpcErrorPrefix(error instanceof Error ? error.message : String(error ?? ''))
  if (!raw) return fallback
  for (const [pattern, message] of NETWORK_ERROR_RULES) {
    if (pattern.test(raw)) return message
  }
  if (CYRILLIC_RE.test(raw)) return raw
  return fallback
}

export function humanizeError(error: unknown, fallback = 'Не удалось выполнить действие.'): string {
  const raw = stripIpcErrorPrefix(error instanceof Error ? error.message : String(error ?? ''))
  if (!raw) return fallback
  for (const [pattern, message] of NETWORK_ERROR_RULES) {
    if (pattern.test(raw)) return message
  }
  if (CYRILLIC_RE.test(raw)) return raw
  return fallback
}

export type ValidationIssueLike = {
  path: ReadonlyArray<PropertyKey>
  message: string
  code?: string
}

const FIELD_LABELS: Record<string, string> = {
  name: 'название',
  playlistName: 'название плейлиста',
  clientId: 'Client ID',
  spotifyProxy: 'прокси Spotify',
  vkProxy: 'прокси VK',
  searchDelayMs: 'пауза между запросами',
  duration: 'длительность',
  tracks: 'список записей',
  range: 'диапазон',
  rangeFrom: 'начало диапазона',
  rangeTo: 'конец диапазона',
  url: 'ссылка',
  uri: 'ссылка Spotify',
}

function translateZodIssueMessage(issue: ValidationIssueLike): string {
  if (CYRILLIC_RE.test(issue.message)) return issue.message
  const msg = issue.message
  if (/uuid/i.test(msg)) return 'неверный идентификатор'
  if (/url/i.test(msg)) return 'некорректная ссылка'
  if (/too small/i.test(msg)) return 'значение слишком маленькое или пустое'
  if (/too big/i.test(msg)) return 'превышен допустимый размер значения'
  if (/unrecognized key/i.test(msg)) return 'передано неизвестное поле'
  if (/invalid option|expected one of/i.test(msg)) return 'недопустимое значение'
  if (/invalid input|expected/i.test(msg)) return 'неверный формат значения'
  return 'некорректное значение'
}

export function humanizeZodError(error: { issues: ReadonlyArray<ValidationIssueLike> }): string {
  if (!error.issues.length) return 'Проверь введённые данные и повтори попытку.'
  const parts = error.issues.slice(0, 3).map((issue) => {
    const rawKey = issue.path.length ? String(issue.path[issue.path.length - 1]) : ''
    const label = FIELD_LABELS[rawKey] ?? (issue.path.length ? issue.path.join('.') : '')
    const text = translateZodIssueMessage(issue).replace(/\.+$/, '')
    return label && !CYRILLIC_RE.test(issue.message) ? `${label}: ${text}` : text
  })
  return `Некорректные данные: ${parts.join('; ')}.`
}
