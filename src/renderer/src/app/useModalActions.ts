import { useCallback, useEffect, useState } from 'react'
import { reviewGroup } from '../../../core/matching'
import type { ViewState } from '../../../shared/sync'
import type { Collection, ImportPreview, Result } from '../../../shared/types'
import { api } from '../state/api'
import type { View } from './useNavigationState'

export type RunOptions = {
  preserveNotice?: boolean
}

export type RunAction = <T>(
  key: string,
  action: () => Promise<Result<T>>,
  success?: string,
  options?: RunOptions,
) => Promise<T | undefined>

interface UseModalActionsParams {
  currentId: string
  vkExpectedCount: number | null
  readState: () => ViewState | null
  run: RunAction
  setView: (view: View) => void
  setCollectionId: (id: string) => void
  setOpenedCollectionId: (id: string | null) => void
}

export function useModalActions({
  currentId,
  vkExpectedCount,
  readState,
  run,
  setView,
  setCollectionId,
  setOpenedCollectionId,
}: UseModalActionsParams) {
  const [spotifyPanel, setSpotifyPanel] = useState<{ jobId?: string } | null>(null)
  const [dismissedHelp, setDismissedHelp] = useState('')
  const [recentExportId, setRecentExportId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [repairTarget, setRepairTarget] = useState<Collection | null>(null)
  const [repairPreview, setRepairPreview] = useState<ImportPreview | null>(null)
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  useEffect(() => {
    if (!recentExportId) return
    const timer = setTimeout(() => {
      setRecentExportId(null)
    }, 12000)
    return () => clearTimeout(timer)
  }, [recentExportId])

  const openSpotifyPanel = useCallback(
    (jobId?: string) => {
      const state = readState()
      const relevant = state?.jobs.find(
        (job) =>
          job.collectionId === currentId &&
          job.kind === 'search' &&
          job.searchProvider === 'browser' &&
          job.state !== 'complete',
      )
      setSpotifyPanel({ jobId: jobId ?? relevant?.id })
    },
    [currentId, readState],
  )

  const closeSpotifyPanel = useCallback(() => setSpotifyPanel(null), [])

  const importFile = useCallback(async () => {
    const value = await run('import', () => api.previewImport())
    if (value) setPreview(value)
  }, [run])

  const saveImport = useCallback(
    async (item: ImportPreview, searchAfterImport: boolean) => {
      const id = await run('save-import', () => api.importCollection(item))
      if (!id) return
      setCollectionId(id)
      setOpenedCollectionId(id)
      setRecentExportId(id)
      setPreview(null)
      setView('library')
      if (searchAfterImport && !item.restored) {
        const state = readState()
        if (
          state &&
          !state.jobs.some((job) => job.state === 'running' || job.state === 'pausing') &&
          (state.settings.searchProvider === 'browser' || state.spotify.connected)
        ) {
          const rows = state.collections.find((entry) => entry.id === id)?.rows ?? []
          const pending = rows
            .filter((row) => reviewGroup(row, state.settings.matchingRules) === 'pending')
            .map((row) => row.id)
          if (pending.length) await run('search', () => api.startSearch(id, pending, true))
        }
      }
    },
    [readState, run, setCollectionId, setOpenedCollectionId, setView],
  )

  const openRepair = useCallback((target: Collection) => {
    setRepairTarget(target)
    setRepairPreview(null)
  }, [])

  const closeRepair = useCallback(() => {
    setRepairTarget(null)
    setRepairPreview(null)
  }, [])

  const selectRepairFile = useCallback(async () => {
    const value = await run('import', () => api.previewImport())
    if (value) setRepairPreview(value)
  }, [run])

  const extractVKForRepair = useCallback(
    async (options?: { rangeFrom?: number; rangeTo?: number; limit?: number }) => {
      const value = await run('extract', () =>
        api.extractVK(options ?? { expectedCount: vkExpectedCount }),
      )
      if (value) setRepairPreview(value)
    },
    [run, vkExpectedCount],
  )

  const confirmRepair = useCallback(
    async (collId: string, previewItem: ImportPreview) => {
      const res = await run(
        'repair',
        () => api.repairCollection(collId, previewItem),
        'Коллекция обновлена без потери решений.',
      )
      if (res !== undefined) {
        setRepairTarget(null)
        setRepairPreview(null)
      }
    },
    [run],
  )

  const startTransfer = useCallback(async () => {
    if (!currentId) return
    const id = await run('transfer', () => api.startTransfer(currentId))
    if (id) {
      setConfirmTransfer(false)
      setView('jobs')
    }
  }, [currentId, run, setView])

  return {
    spotifyPanel,
    setSpotifyPanel,
    openSpotifyPanel,
    closeSpotifyPanel,
    dismissedHelp,
    setDismissedHelp,
    recentExportId,
    setRecentExportId,
    preview,
    setPreview,
    repairTarget,
    setRepairTarget,
    repairPreview,
    setRepairPreview,
    confirmTransfer,
    setConfirmTransfer,
    importFile,
    saveImport,
    openRepair,
    closeRepair,
    selectRepairFile,
    extractVKForRepair,
    confirmRepair,
    startTransfer,
  }
}
