import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge, IpcEventMap, IpcInvokeMap } from '../shared/ipc'
import type { Result } from '../shared/types'

function invoke<K extends keyof IpcInvokeMap>(
  method: K,
  ...args: IpcInvokeMap[K]['args']
): Promise<Result<IpcInvokeMap[K]['result']>> {
  return ipcRenderer.invoke('vkspot:' + method, ...args)
}

function subscribe<K extends keyof IpcEventMap>(
  channel: K,
  callback: (...args: IpcEventMap[K]) => void,
): () => void {
  if (typeof callback !== 'function') return () => {}
  const eventName = 'vkspot:' + channel
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    callback(...(args as IpcEventMap[K]))
  }
  ipcRenderer.on(eventName, listener)
  return () => ipcRenderer.removeListener(eventName, listener)
}

const bridge: Bridge = {
  canInspectSpotify: process.platform === 'win32',
  state: () => invoke('state'),
  syncState: (cursor) => invoke('syncState', cursor),
  previewImport: () => invoke('previewImport'),
  importCollection: (p) => invoke('importCollection', p),
  renameCollection: (id, name) => invoke('renameCollection', id, name),
  deleteCollection: (id) => invoke('deleteCollection', id),
  reorderCollections: (ids) => invoke('reorderCollections', ids),
  repairCollection: (id, p) => invoke('repairCollection', id, p),
  exportCollection: (id, f) => invoke('exportCollection', id, f),
  patchRows: (id, ids, p) => invoke('patchRows', id, ids, p),
  confirmMetadataMatches: (id, ids) => invoke('confirmMetadataMatches', id, ids),
  undo: (id) => invoke('undo', id),
  linkFile: (id, row) => invoke('linkFile', id, row),
  saveSettings: (s) => invoke('saveSettings', s),
  connectSpotify: () => invoke('connectSpotify'),
  disconnectSpotify: () => invoke('disconnectSpotify'),
  showSpotifyBrowser: (bounds, owner) => invoke('showSpotifyBrowser', bounds, owner),
  reloadSpotifyBrowser: (owner) => invoke('reloadSpotifyBrowser', owner),
  continueSearchInBrowser: (id) => invoke('continueSearchInBrowser', id),
  startSearch: (id, rows, background) => invoke('startSearch', id, rows, background),
  startTransfer: (id) => invoke('startTransfer', id),
  controlJob: (id, a) => invoke('controlJob', id, a),
  archiveJob: (id) => invoke('archiveJob', id),
  archiveFinishedJobs: () => invoke('archiveFinishedJobs'),
  reconcileMixed: (id) => invoke('reconcileMixed', id),
  recoverPlaylist: (id, playlistId) => invoke('recoverPlaylist', id, playlistId),
  openVK: () => invoke('openVK'),
  extractVK: (options) => invoke('extractVK', options),
  cancelVKExtraction: () => invoke('cancelVKExtraction'),
  clearVK: () => invoke('clearVK'),
  prepareLocal: (id) => invoke('prepareLocal', id),
  helper: (a) => invoke('helper', a),
  openExternal: (url) => invoke('openExternal', url),
  playVKTrack: (track) => invoke('playVKTrack', track),
  pauseVKTrack: () => invoke('pauseVKTrack'),
  resumeVKTrack: () => invoke('resumeVKTrack'),
  setVKVolume: (volume) => invoke('setVKVolume', volume),
  testProxy: (url, target) => invoke('testProxy', url, target),
  onChange: (callback) => subscribe('change', callback),
  onVKProgress: (callback) => subscribe('vk-progress', callback),
  onVKAudioProgress: (callback) => subscribe('vk-audio-progress', callback),
}
contextBridge.exposeInMainWorld('vkspot', bridge)
