import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { summarizeCollection } from '../../../core/library'
import { reviewGroup } from '../../../core/matching'
import type { ExportFormat, Result, VKExportProgress, Working } from '../../../shared/types'
import { api } from '../state/api'
import { clearCollectionDrafts, draftsStore } from '../state/drafts'
import { useAppState } from '../state/useAppState'
import { type RunOptions } from './useModalActions'
import { useModalActions } from './useModalActions'
import { useNavigationState } from './useNavigationState'

type ActiveOp = { id: number; key: string }

function resolveBusy(ops: readonly ActiveOp[]): string {
  if (!ops.length) return ''
  if (ops.some((op) => op.key === 'extract')) return 'extract'
  if (ops.some((op) => op.key === 'connect')) return 'connect'
  return ops[ops.length - 1]!.key
}

export function useWorkspaceController() {
  const [vkExpected, setVKExpected] = useState('')
  const [vkProgress, setVKProgress] = useState<VKExportProgress | null>(null)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState('')

  const activeOpsRef = useRef<ActiveOp[]>([])
  const nextOpIdRef = useRef(1)

  const handleStateError = useCallback((message: string) => {
    setNotice({ message, error: true })
  }, [])

  const { data, refresh, readState } = useAppState(api, handleStateError)
  const nav = useNavigationState(data?.collections)

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
      options?: RunOptions,
    ): Promise<T | undefined> => {
      const id = nextOpIdRef.current++
      activeOpsRef.current = [...activeOpsRef.current, { id, key }]
      setBusy(resolveBusy(activeOpsRef.current))
      if (!options?.preserveNotice) setNotice(null)
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
        activeOpsRef.current = activeOpsRef.current.filter((op) => op.id !== id)
        setBusy(resolveBusy(activeOpsRef.current))
      }
    },
    [refresh],
  )

  const runBackground = useCallback(
    async <T>(action: () => Promise<Result<T>>, fallbackError: string): Promise<T | undefined> => {
      try {
        const result = await action()
        if (!result.ok) {
          setNotice({ message: result.error, error: true })
          return undefined
        }
        return result.value
      } catch {
        setNotice({ message: fallbackError, error: true })
        return undefined
      }
    },
    [],
  )

  const currentId = nav.openedCollectionId || nav.collectionId
  const collection = useMemo(
    () => data?.collections.find((c) => c.id === currentId),
    [data?.collections, currentId],
  )

  const counts = useMemo(
    () => summarizeCollection(collection, data?.settings.matchingRules).destinations,
    [collection, data?.settings.matchingRules],
  )

  const modals = useModalActions({
    currentId,
    vkExpectedCount,
    readState,
    run,
    setView: nav.setView,
    setCollectionId: nav.setCollectionId,
    setOpenedCollectionId: nav.setOpenedCollectionId,
  })

  const patch = useCallback(
    async (ids: string[], value: Partial<Working>): Promise<boolean> => {
      const saved = await run('patch', async () => {
        const result = await api.patchRows(currentId, ids, value)
        if (result.ok && ['artist', 'title', 'version', 'note'].some((key) => key in value)) {
          draftsStore.clearRows(ids)
        }
        return result.ok ? { ok: true as const, value: true } : result
      })
      return saved === true
    },
    [currentId, run],
  )

  const search = useCallback(
    (ids: string[], background = false) =>
      run('search', () => api.startSearch(currentId, ids, background)),
    [currentId, run],
  )

  const setAutoResume = useCallback(
    (value: boolean) => {
      const state = readState()
      if (state) {
        void run(
          'settings',
          () => api.saveSettings({ ...state.settings, autoResumeSearch: value }),
          undefined,
          { preserveNotice: true },
        )
      }
    },
    [readState, run],
  )

  const beginSearch = useCallback(() => {
    const state = readState()
    const target = state?.collections.find((c) => c.id === currentId) ?? collection
    if (!target) return
    nav.setOpenedCollectionId(target.id)
    nav.setView('library')
    const rules = state?.settings.matchingRules ?? data?.settings.matchingRules
    void run('search', () =>
      api.startSearch(
        target.id,
        target.rows.filter((row) => reviewGroup(row, rules) === 'pending').map((row) => row.id),
        true,
      ),
    )
  }, [collection, currentId, data?.settings.matchingRules, nav, readState, run])

  const continueSearch = useCallback(
    (id: string, browser: boolean) => {
      const job = readState()?.jobs.find((item) => item.id === id)
      if (job) {
        nav.setCollectionId(job.collectionId)
        nav.setOpenedCollectionId(job.collectionId)
      }
      nav.setView('library')
      void run('control', () =>
        browser ? api.continueSearchInBrowser(id) : api.controlJob(id, 'resume'),
      )
    },
    [nav, readState, run],
  )

  const confirmMetadata = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const result = await run('confirm', () => api.confirmMetadataMatches(currentId, ids))
      return result !== undefined
    },
    [currentId, run],
  )

  const linkFile = useCallback(
    async (rowId: string): Promise<boolean> => {
      await run('file', () => api.linkFile(currentId, rowId))
      const result = readState()
      return (
        Boolean(result) &&
        result!.collections
          .find((item) => item.id === currentId)
          ?.rows.find((item) => item.id === rowId)?.working.destination === 'local'
      )
    },
    [currentId, readState, run],
  )

  const exported = useCallback(
    (format: ExportFormat, targetId?: string) => {
      const targetCollId = targetId ?? currentId
      if (!targetCollId) return
      void run('export', () => api.exportCollection(targetCollId, format)).then((path) => {
        if (path) setNotice({ message: `Сохранено: ${path}`, error: false })
      })
    },
    [currentId, run],
  )

  const renameCollection = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const saved = await run(
        'rename-collection',
        async () => {
          const result = await api.renameCollection(id, name)
          return result.ok ? { ok: true as const, value: true } : result
        },
        'Коллекция переименована.',
      )
      return saved === true
    },
    [run],
  )

  const deleteCollection = useCallback(
    async (id: string) => {
      const rowIds =
        readState()
          ?.collections.find((entry) => entry.id === id)
          ?.rows.map((row) => row.id) ?? []
      const deleted = await run(
        'delete-collection',
        async () => {
          const result = await api.deleteCollection(id)
          return result.ok ? { ok: true as const, value: true } : result
        },
        'Коллекция удалена.',
      )
      if (deleted === true) {
        clearCollectionDrafts(rowIds)
        if (nav.openedCollectionId === id) nav.setOpenedCollectionId(null)
      }
    },
    [nav, readState, run],
  )

  const reorderCollections = useCallback(
    async (ids: string[]) => {
      await run('reorder-collections', () => api.reorderCollections(ids), undefined, {
        preserveNotice: true,
      })
    },
    [run],
  )

  const openVK = useCallback(() => {
    void run('vk', () => api.openVK(), undefined, { preserveNotice: true })
  }, [run])

  const cancelVKExtraction = useCallback(() => {
    void runBackground(() => api.cancelVKExtraction(), 'Не удалось остановить выгрузку VK.')
  }, [runBackground])

  const extractVKPreview = useCallback(() => {
    void run('extract', () => api.extractVK({ expectedCount: vkExpectedCount })).then((value) => {
      if (value) modals.setPreview(value)
    })
  }, [modals, run, vkExpectedCount])

  const prepareLocal = useCallback(() => {
    if (!currentId) return
    void run('prepare', () => api.prepareLocal(currentId)).then((path) => {
      if (path) {
        setNotice({
          message: `Файлы и план сохранены: ${path}`,
          error: false,
        })
      }
    })
  }, [currentId, run])

  return {
    ...nav,
    ...modals,
    currentId,
    vkExpected,
    setVKExpected,
    vkProgress,
    notice,
    setNotice,
    busy,
    data,
    readState,
    vkExpectedCount,
    invalidVKCount,
    run,
    collection,
    counts,
    patch,
    search,
    setAutoResume,
    beginSearch,
    continueSearch,
    confirmMetadata,
    linkFile,
    exported,
    renameCollection,
    deleteCollection,
    reorderCollections,
    openVK,
    cancelVKExtraction,
    extractVKPreview,
    prepareLocal,
  }
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>
