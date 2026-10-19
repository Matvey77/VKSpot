import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge } from '../shared/model'
const invoke = (method: string, ...args: unknown[]) =>
  ipcRenderer.invoke('vkspot:' + method, ...args)
const bridge: Bridge = {
  state: () => invoke('state'),
  previewImport: () => invoke('previewImport'),
  importCollection: (p) => invoke('importCollection', p),
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
  testProxy: (url, target) => invoke('testProxy', url, target),
  onChange: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('vkspot:change', listener)
    return () => ipcRenderer.removeListener('vkspot:change', listener)
  },
  onVKProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: Parameters<typeof callback>[0],
    ) => callback(progress)
    ipcRenderer.on('vkspot:vk-progress', listener)
    return () => ipcRenderer.removeListener('vkspot:vk-progress', listener)
  },
}
contextBridge.exposeInMainWorld('vkspot', bridge)
