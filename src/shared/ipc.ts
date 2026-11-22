import type { StateCursor, StateSync } from './sync'
import type {
  AppState,
  ExportFormat,
  ImportPreview,
  ProxyTestResult,
  Result,
  Settings,
  VKExportProgress,
  VKExtractOptions,
  VKPlayTrackRequest,
  Working,
} from './types'

export type IpcInvokeMap = {
  state: { args: []; result: AppState }
  syncState: { args: [cursor: StateCursor | null]; result: StateSync }
  previewImport: { args: []; result: ImportPreview | null }
  importCollection: { args: [preview: ImportPreview]; result: string }
  renameCollection: { args: [id: string, name: string]; result: void }
  deleteCollection: { args: [id: string]; result: void }
  reorderCollections: { args: [ids: string[]]; result: void }
  repairCollection: {
    args: [id: string, preview: ImportPreview]
    result: { preservedCount: number; addedCount: number; totalCount: number }
  }
  exportCollection: { args: [id: string, format: ExportFormat]; result: string | null }
  patchRows: { args: [collectionId: string, ids: string[], patch: Partial<Working>]; result: void }
  confirmMetadataMatches: { args: [collectionId: string, ids: string[]]; result: number }
  undo: { args: [collectionId: string]; result: boolean }
  linkFile: { args: [collectionId: string, rowId: string]; result: void }
  saveSettings: { args: [settings: Settings]; result: void }
  connectSpotify: { args: []; result: void }
  disconnectSpotify: { args: []; result: void }
  showSpotifyBrowser: {
    args: [bounds: { x: number; y: number; width: number; height: number } | null, owner?: string]
    result: void
  }
  reloadSpotifyBrowser: { args: [owner?: string]; result: void }
  continueSearchInBrowser: { args: [id: string]; result: void }
  startSearch: {
    args: [collectionId: string, rowIds: string[], background?: boolean]
    result: string
  }
  startTransfer: { args: [collectionId: string]; result: string }
  controlJob: { args: [id: string, action: 'pause' | 'resume']; result: void }
  archiveJob: { args: [id: string]; result: void }
  archiveFinishedJobs: { args: []; result: number }
  reconcileMixed: { args: [id: string]; result: void }
  recoverPlaylist: { args: [id: string, playlistId: string]; result: void }
  openVK: { args: []; result: void }
  extractVK: { args: [options?: VKExtractOptions]; result: ImportPreview }
  cancelVKExtraction: { args: []; result: void }
  clearVK: { args: []; result: void }
  prepareLocal: { args: [id: string]; result: string | null }
  helper: { args: [action: 'inspect' | 'open-spotify']; result: string }
  openExternal: { args: [url: string]; result: void }
  playVKTrack: { args: [track: VKPlayTrackRequest]; result: { playing: boolean; error?: string } }
  pauseVKTrack: { args: []; result: { playing: boolean } }
  resumeVKTrack: { args: []; result: { playing: boolean } }
  testProxy: { args: [proxyUrl: string, target?: 'spotify' | 'vk']; result: ProxyTestResult }
}

export type IpcEventMap = {
  change: []
  'vk-progress': [progress: VKExportProgress | null]
  'vk-audio-progress': [message: string]
}

export type Bridge = {
  canInspectSpotify: boolean
  onChange(callback: () => void): () => void
  onVKProgress(callback: (progress: VKExportProgress | null) => void): () => void
  onVKAudioProgress(callback: (message: string) => void): () => void
} & {
  [K in keyof IpcInvokeMap]: (
    ...args: IpcInvokeMap[K]['args']
  ) => Promise<Result<IpcInvokeMap[K]['result']>>
}

declare global {
  interface Window {
    vkspot: Bridge
  }
}
