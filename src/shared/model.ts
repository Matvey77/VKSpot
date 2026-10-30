import { z } from 'zod'
import { defaultMatchingRules } from './defaults'
export { defaultMatchingRules } from './defaults'

export const rawTrackSchema = z.object({
  id: z.string().default(''),
  artist: z.string().default(''),
  title: z.string().default(''),
  duration: z
    .preprocess(
      (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null),
      z.number().nonnegative().nullable(),
    )
    .default(null),
  availability: z.enum(['available', 'blocked', 'unknown']).default('unknown'),
  url: z.string().default(''),
  rawText: z.string().default(''),
})
export const spotifyTrackSchema = z.object({
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/),
  title: z.string(),
  artists: z.array(z.string()),
  duration: z.number().nonnegative(),
  url: z.string(),
  album: z.string().default(''),
})
export const localFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  artist: z.string(),
  title: z.string(),
  duration: z.number().nonnegative().nullable(),
  codec: z.string(),
  bitrate: z.number().nullable(),
  size: z.number(),
})
export const workingSchema = z.object({
  artist: z.string(),
  title: z.string(),
  version: z.string().default(''),
  excluded: z.boolean().default(false),
  note: z.string().default(''),
  spotify: spotifyTrackSchema.nullable().default(null),
  local: localFileSchema.nullable().default(null),
  destination: z.enum(['unresolved', 'spotify', 'local']).default('unresolved'),
  candidates: z.array(spotifyTrackSchema).default([]),
  searchedQuery: z.string().nullable().default(null),
  localPending: z.boolean().default(false),
  reviewDeferred: z.boolean().default(false),
})
// Partial commands must not apply defaults to omitted fields (Zod 4).
export const workingPatchSchema = z
  .object({
    artist: z.string().optional(),
    title: z.string().optional(),
    version: z.string().optional(),
    excluded: z.boolean().optional(),
    note: z.string().optional(),
    spotify: spotifyTrackSchema.nullable().optional(),
    local: localFileSchema.nullable().optional(),
    destination: z.enum(['unresolved', 'spotify', 'local']).optional(),
    candidates: z.array(spotifyTrackSchema).optional(),
    searchedQuery: z.string().nullable().optional(),
    localPending: z.boolean().optional(),
    reviewDeferred: z.boolean().optional(),
  })
  .strict()
export const rowSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().positive(),
  source: rawTrackSchema,
  working: workingSchema,
})
export const completenessSchema = z.object({
  expected: z.number().int().nonnegative().nullable().default(null),
  status: z.enum(['verified-count', 'unverified']).default('unverified'),
  message: z.string().default('Полнота исходной коллекции не подтверждена.'),
})
export const collectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  importedAt: z.string(),
  origin: z.string(),
  completeness: completenessSchema,
  sourceHash: z.string(),
  rows: z.array(rowSchema),
})
export const archiveSchema = z.object({
  format: z.literal('vkspot'),
  version: z.literal(1),
  collection: collectionSchema,
})
export type RawTrack = z.infer<typeof rawTrackSchema>
export type SpotifyTrack = z.infer<typeof spotifyTrackSchema>
export type LocalFile = z.infer<typeof localFileSchema>
export type Working = z.infer<typeof workingSchema>
export type TrackRow = z.infer<typeof rowSchema>
export type Collection = z.infer<typeof collectionSchema>
export type Completeness = z.infer<typeof completenessSchema>
export const matchingRulesSchema = z.object({
  diacritics: z.boolean().default(true),
  homoglyphs: z.boolean().default(true),
  featDeduplication: z.boolean().default(true),
  identicalVersions: z.boolean().default(true),
  remixPunctuation: z.boolean().default(true),
  extendedDurationTolerance: z.boolean().default(true),
  transliteration: z.boolean().default(true),
})
export type MatchingRules = z.infer<typeof matchingRulesSchema>

export type Settings = {
  clientId: string
  spotifyProxy: string
  useProxyForVK: boolean
  vkProxy: string
  matchingRules: MatchingRules
  playlistName: string
  searchDelayMs: number
  autoResumeSearch: boolean
  searchProvider: 'browser' | 'api'
  theme: 'light' | 'dark'
}
const proxySchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return (
        ['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password &&
        (!url.pathname || url.pathname === '/') &&
        !url.search &&
        !url.hash
      )
    } catch {
      return false
    }
  }, 'Укажите HTTP или SOCKS5 адрес прокси без логина, пароля и пути.')
  .default('')

export const settingsSchema = z.object({
  clientId: z.string().max(100),
  spotifyProxy: proxySchema,
  useProxyForVK: z.boolean().default(false),
  vkProxy: proxySchema,
  matchingRules: matchingRulesSchema.default(defaultMatchingRules),
  playlistName: z.string().min(1).max(200),
  searchDelayMs: z.number().int().min(1000).max(60000),
  autoResumeSearch: z.boolean().default(true),
  searchProvider: z.enum(['browser', 'api']).default('browser'),
  theme: z.enum(['light', 'dark']),
})
export type Job = {
  id: string
  collectionId: string
  kind: 'search' | 'transfer'
  state: 'paused' | 'running' | 'pausing' | 'complete' | 'failed' | 'needs-review'
  cursor: number
  total: number
  message: string
  playlistId?: string
  rowIds: string[]
  plan?: PlanItem[]
  retryAt?: number
  waitReason?: 'quota' | 'rate-limit'
  backgroundSearch?: boolean
  refreshSearchResults?: boolean
  autoResume?: boolean
  searchProvider?: 'browser' | 'api'
  createdAt: string
  updatedAt: string
}
export type PlanItem = {
  rowId: string
  position: number
  artist: string
  title: string
  version: string
  destination: 'spotify' | 'local'
  uri: string | null
  local: LocalFile | null
}
export type AppState = {
  collections: Collection[]
  jobs: Job[]
  settings: Settings
  spotify: { connected: boolean; name: string }
  vk?: VKStatus
  spotifyBrowser?: SpotifyBrowserState
  dataPath: string
}
export type SpotifyBrowserState = {
  state: 'idle' | 'searching' | 'attention'
  message: string
  reason?: 'verification' | 'load' | 'read'
  page?: {
    state: 'idle' | 'loading' | 'ready' | 'error'
    message: string
  }
}
export type VKStatus = {
  state: 'unknown' | 'checking' | 'connected' | 'sign-in' | 'error'
  message?: string
  checkedAt?: string
}
export type ImportPreview = {
  name: string
  origin: string
  tracks: RawTrack[]
  completeness: Completeness
  restored?: Collection
  range?: {
    from: number
    to: number
  }
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export type VKExportProgress = {
  collected: number
  expected: number | null
  message: string
}
export type Bridge = {
  canInspectSpotify: boolean
  state(): Promise<Result<AppState>>
  syncState(
    cursor: import('./sync').StateCursor | null,
  ): Promise<Result<import('./sync').StateSync>>
  previewImport(): Promise<Result<ImportPreview | null>>
  importCollection(preview: ImportPreview): Promise<Result<string>>
  renameCollection(id: string, name: string): Promise<Result<void>>
  deleteCollection(id: string): Promise<Result<void>>
  reorderCollections(ids: string[]): Promise<Result<void>>
  repairCollection(
    id: string,
    preview: ImportPreview,
  ): Promise<Result<{ preservedCount: number; addedCount: number; totalCount: number }>>
  exportCollection(
    id: string,
    format: 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan',
  ): Promise<Result<string | null>>
  patchRows(collectionId: string, ids: string[], patch: Partial<Working>): Promise<Result<void>>
  confirmMetadataMatches(collectionId: string, ids: string[]): Promise<Result<number>>
  undo(collectionId: string): Promise<Result<boolean>>
  linkFile(collectionId: string, rowId: string): Promise<Result<void>>
  saveSettings(settings: Settings): Promise<Result<void>>
  connectSpotify(): Promise<Result<void>>
  disconnectSpotify(): Promise<Result<void>>
  showSpotifyBrowser(
    bounds: { x: number; y: number; width: number; height: number } | null,
    owner?: string,
  ): Promise<Result<void>>
  reloadSpotifyBrowser(owner?: string): Promise<Result<void>>
  continueSearchInBrowser(id: string): Promise<Result<void>>
  startSearch(collectionId: string, rowIds: string[], background?: boolean): Promise<Result<string>>
  startTransfer(collectionId: string): Promise<Result<string>>
  controlJob(id: string, action: 'pause' | 'resume'): Promise<Result<void>>
  archiveJob(id: string): Promise<Result<void>>
  archiveFinishedJobs(): Promise<Result<number>>
  reconcileMixed(id: string): Promise<Result<void>>
  recoverPlaylist(id: string, playlistId: string): Promise<Result<void>>
  openVK(): Promise<Result<void>>
  extractVK(options?: {
    expectedCount?: number | null
    rangeFrom?: number | null
    rangeTo?: number | null
    limit?: number | null
  }): Promise<Result<ImportPreview>>
  cancelVKExtraction(): Promise<Result<void>>
  onVKProgress(callback: (progress: VKExportProgress | null) => void): () => void
  clearVK(): Promise<Result<void>>
  prepareLocal(id: string): Promise<Result<string | null>>
  helper(action: 'inspect' | 'open-spotify'): Promise<Result<string>>
  openExternal(url: string): Promise<Result<void>>
  playVKTrack(track: {
    id?: string
    artist: string
    title: string
    duration?: number | null
    position?: number
  }): Promise<Result<{ playing: boolean; error?: string }>>
  pauseVKTrack(): Promise<Result<{ playing: boolean }>>
  onVKAudioProgress(callback: (message: string) => void): () => void
  resumeVKTrack(): Promise<Result<{ playing: boolean }>>
  testProxy(
    proxyUrl: string,
    target?: 'spotify' | 'vk',
  ): Promise<Result<{ ok: boolean; latencyMs?: number; error?: string }>>
  onChange(callback: () => void): () => void
}
declare global {
  interface Window {
    vkspot: Bridge
  }
}
