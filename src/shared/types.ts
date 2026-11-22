import type { MatchingRules } from './defaults'

export type { MatchingRules }

export type RawTrack = {
  id: string
  artist: string
  title: string
  duration: number | null
  availability: 'available' | 'blocked' | 'unknown'
  url: string
  rawText: string
}

export type SpotifyTrack = {
  uri: string
  title: string
  artists: string[]
  duration: number
  url: string
  album: string
}

export type LocalFile = {
  path: string
  sha256: string
  artist: string
  title: string
  duration: number | null
  codec: string
  bitrate: number | null
  size: number
}

export type Working = {
  artist: string
  title: string
  version: string
  excluded: boolean
  note: string
  spotify: SpotifyTrack | null
  local: LocalFile | null
  destination: 'unresolved' | 'spotify' | 'local'
  candidates: SpotifyTrack[]
  searchedQuery: string | null
  localPending: boolean
  reviewDeferred: boolean
}

export type TrackRow = {
  id: string
  position: number
  source: RawTrack
  working: Working
}

export type CompletenessReason =
  | 'verified'
  | 'end-of-list'
  | 'count-mismatch'
  | 'cancelled'
  | 'timeout'
  | 'gap'
  | 'page-changed'
  | 'limit'
  | 'file-import'
  | 'unknown'

export type Completeness = {
  expected: number | null
  status: 'verified-count' | 'unverified'
  message: string
  reason?: CompletenessReason
}

export type Collection = {
  id: string
  name: string
  importedAt: string
  origin: string
  completeness: Completeness
  sourceHash: string
  rows: TrackRow[]
}

export type Archive = {
  format: 'vkspot'
  version: 1
  collection: Collection
}

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

export type JobStatus = Omit<Job, 'rowIds' | 'plan'>

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

export type AppState = {
  collections: Collection[]
  jobs: Job[]
  settings: Settings
  spotify: { connected: boolean; name: string }
  vk?: VKStatus
  spotifyBrowser?: SpotifyBrowserState
  dataPath: string
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

export type ExportFormat = 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type VKExportProgress = {
  collected: number
  expected: number | null
  message: string
}

export type VKExtractOptions = {
  expectedCount?: number | null
  rangeFrom?: number | null
  rangeTo?: number | null
  limit?: number | null
}

export type VKPlayTrackRequest = {
  id?: string
  artist: string
  title: string
  duration?: number | null
  position?: number
}

export type ProxyTestResult =
  { ok: true; latencyMs: number; status: number } | { ok: false; error: string }
