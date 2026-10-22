import { useCallback, useEffect, useMemo, useState } from 'react'
import { summarizeCollection } from '../../../core/library'
import { reviewGroup, type SearchResultGroup } from '../../../core/matching'
import { retryDeadline } from '../../../shared/job-status'
import type {
  Collection,
  ImportPreview,
  Result,
  VKExportProgress,
  Working,
} from '../../../shared/model'
import { type Draft, type Filter } from '../features/library/LibraryView'
import { api } from '../state/api'
import { useAppState } from '../state/useAppState'
import useRetryClock from '../hooks/useRetryClock'

type View = 'welcome' | 'library' | 'connections' | 'jobs' | 'settings'
export function useWorkspaceController() {
  const [view, setView] = useState<View>('welcome')
  const [showGuide, setShowGuide] = useState(false)
  const [spotifyPanel, setSpotifyPanel] = useState<{ jobId?: string } | null>(null)
  const [dismissedHelp, setDismissedHelp] = useState('')
  const [recentExportId, setRecentExportId] = useState<string | null>(null)

  useEffect(() => {
    if (!recentExportId) return
    const timer = setTimeout(() => {
      setRecentExportId(null)
    }, 12000)
    return () => clearTimeout(timer)
  }, [recentExportId])

  const [collectionId, setCollectionId] = useState('')
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<Collection | null>(null)
  const [repairPreview, setRepairPreview] = useState<ImportPreview | null>(null)
  const [focusId, setFocusId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [resultFilter, setResultFilter] = useState<'all' | SearchResultGroup>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [vkExpected, setVKExpected] = useState('')
  const [vkProgress, setVKProgress] = useState<VKExportProgress | null>(null)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  const { data, refresh, readState } = useAppState(api, (message) =>
    setNotice({ message, error: true }),
  )
  const jobNow = useRetryClock(view === 'jobs' ? retryDeadline(data?.jobs ?? []) : 0)
  useEffect(() => {
    if (!data) return
    setCollectionId((current) =>
      data.collections.some((c) => c.id === current) ? current : (data.collections[0]?.id ?? ''),
    )
    setOpenedCollectionId((current) =>
      current && data.collections.some((c) => c.id === current) ? current : null,
    )
  }, [data?.collections])

  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? 'light'
  }, [data?.settings.theme])

  useEffect(() => api.onVKProgress(setVKProgress), [])

  const vkExpectedCount = vkExpected.trim() ? Number(vkExpected) : null
  const invalidVKCount =
    vkExpectedCount !== null &&
    (!Number.isSafeInteger(vkExpectedCount) || vkExpectedCount < 1 || vkExpectedCount > 1_000_000)

  const run = useCallback(
    async <T>(
      key: string,
      action: () => Promise<Result<T>>,
      success?: string,
    ): Promise<T | undefined> => {
      setBusy(key)
      setNotice(null)
      try {
        const result = await action()
        if (!result.ok) {
          setNotice({ message: result.error, error: true })
          return undefined
        }
        if (success) setNotice({ message: success, error: false })
        await refresh()
        return result.value
      } catch {
        setNotice({
          message:
            'Связь с приложением прервана. Перезапустите VKSpot; коллекция сохранена локально.',
          error: true,
        })
        return undefined
      } finally {
        setBusy('')
      }
    },
    [refresh],
  )

  const currentId = openedCollectionId || collectionId
  const collection = data?.collections.find((c) => c.id === currentId)

  const counts = useMemo(
    () => summarizeCollection(collection, data?.settings.matchingRules).destinations,
    [collection, data?.settings.matchingRules],
  )

  const patch = async (ids: string[], value: Partial<Working>): Promise<boolean> => {
    const targetCollId = openedCollectionId || collectionId
    const saved = await run('patch', async () => {
      const result = await api.patchRows(targetCollId, ids, value)
      if (result.ok && ['artist', 'title', 'version', 'note'].some((key) => key in value))
        setDrafts((current) => {
          const next = { ...current }
          ids.forEach((id) => delete next[id])
          return next
        })
      return result.ok ? { ok: true as const, value: true } : result
    })
    return saved === true
  }

  const importFile = async () => {
    const value = await run('import', () => api.previewImport())
    if (value) setPreview(value)
  }

  const search = (ids: string[], background = false) => {
    const targetCollId = openedCollectionId || collectionId
    return run('search', () => api.startSearch(targetCollId, ids, background))
  }

  const setAutoResume = (value: boolean) => {
    if (data)
      void run('settings', () => api.saveSettings({ ...data.settings, autoResumeSearch: value }))
  }

  const beginSearch = () => {
    if (!collection) return
    setOpenedCollectionId(collection.id)
    setView('library')
    search(
      collection.rows
        .filter((row) => reviewGroup(row, data?.settings.matchingRules) === 'pending')
        .map((row) => row.id),
      true,
    )
  }

  const continueSearch = (id: string, browser: boolean) => {
    const job = data?.jobs.find((item) => item.id === id)
    if (job) {
      setCollectionId(job.collectionId)
      setOpenedCollectionId(job.collectionId)
    }
    setView('library')
    void run('control', () =>
      browser ? api.continueSearchInBrowser(id) : api.controlJob(id, 'resume'),
    )
  }

  const openSpotifyPanel = (jobId?: string) => {
    const targetCollId = openedCollectionId || collectionId
    const relevant = data?.jobs.find(
      (job) =>
        job.collectionId === targetCollId &&
        job.kind === 'search' &&
        job.searchProvider === 'browser' &&
        job.state !== 'complete',
    )
    setSpotifyPanel({ jobId: jobId ?? relevant?.id })
  }

  const confirmMetadata = async (ids: string[]): Promise<boolean> => {
    const targetCollId = openedCollectionId || collectionId
    const result = await run('confirm', () => api.confirmMetadataMatches(targetCollId, ids))
    return result !== undefined
  }

  const linkFile = async (rowId: string): Promise<boolean> => {
    const targetCollId = openedCollectionId || collectionId
    await run('file', () => api.linkFile(targetCollId, rowId))
    const result = readState()
    return (
      Boolean(result) &&
      result!.collections
        .find((item) => item.id === targetCollId)
        ?.rows.find((item) => item.id === rowId)?.working.destination === 'local'
    )
  }

  const exported = (
    format: 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan',
    targetId?: string,
  ) => {
    const targetCollId = targetId ?? openedCollectionId ?? collectionId
    if (!targetCollId) return
    void run('export', () => api.exportCollection(targetCollId, format)).then((path) => {
      if (path) setNotice({ message: `Сохранено: ${path}`, error: false })
    })
  }

  const renameCollection = async (id: string, name: string) => {
    await run('rename-collection', () => api.renameCollection(id, name), 'Коллекция переименована.')
  }

  const deleteCollection = async (id: string) => {
    await run('delete-collection', () => api.deleteCollection(id), 'Коллекция удалена.')
    if (openedCollectionId === id) setOpenedCollectionId(null)
  }

  const reorderCollections = async (ids: string[]) => {
    await run('reorder-collections', () => api.reorderCollections(ids))
  }

  const openRepair = (target: Collection) => {
    setRepairTarget(target)
    setRepairPreview(null)
  }

  const confirmRepair = async (collId: string, previewItem: ImportPreview) => {
    const res = await run(
      'repair',
      () => api.repairCollection(collId, previewItem),
      'Коллекция успешно обновлена без потери решений!',
    )
    if (res) {
      setRepairTarget(null)
      setRepairPreview(null)
      await refresh()
    }
  }

  useEffect(() => {
    setSelected(new Set())
    setFocusId('')
    setQuery('')
    setFilter('all')
    setResultFilter('all')
  }, [collectionId])

  return {
    view,
    setView,
    showGuide,
    setShowGuide,
    spotifyPanel,
    setSpotifyPanel,
    dismissedHelp,
    setDismissedHelp,
    recentExportId,
    setRecentExportId,
    collectionId,
    setCollectionId,
    openedCollectionId,
    setOpenedCollectionId,
    repairTarget,
    setRepairTarget,
    repairPreview,
    setRepairPreview,
    focusId,
    setFocusId,
    drafts,
    setDrafts,
    query,
    setQuery,
    filter,
    setFilter,
    resultFilter,
    setResultFilter,
    selected,
    setSelected,
    preview,
    setPreview,
    vkExpected,
    setVKExpected,
    vkProgress,
    setVKProgress,
    notice,
    setNotice,
    busy,
    setBusy,
    confirmTransfer,
    setConfirmTransfer,
    data,
    refresh,
    readState,
    jobNow,
    vkExpectedCount,
    invalidVKCount,
    run,
    currentId,
    collection,
    counts,
    patch,
    importFile,
    search,
    setAutoResume,
    beginSearch,
    continueSearch,
    openSpotifyPanel,
    confirmMetadata,
    linkFile,
    exported,
    renameCollection,
    deleteCollection,
    reorderCollections,
    openRepair,
    confirmRepair,
  }
}
export type WorkspaceController = ReturnType<typeof useWorkspaceController>
