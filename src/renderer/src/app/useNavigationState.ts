import { useCallback, useEffect, useState } from 'react'
import type { LibraryFilter } from '../../../core/library'
import type { SearchResultGroup } from '../../../core/matching'
import type { Collection } from '../../../shared/types'

export type View = 'welcome' | 'library' | 'connections' | 'jobs' | 'settings'

export function useNavigationState(collections: readonly Collection[] | undefined) {
  const [view, setView] = useState<View>('welcome')
  const [showGuide, setShowGuide] = useState(false)
  const [collectionId, setCollectionId] = useState('')
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null)
  const [inspectorOverlayOpen, setInspectorOverlayOpen] = useState(false)
  const [focusId, setFocusId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [resultFilter, setResultFilter] = useState<'all' | SearchResultGroup>('all')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!collections) return
    setCollectionId((current) =>
      collections.some((c) => c.id === current) ? current : (collections[0]?.id ?? ''),
    )
    setOpenedCollectionId((current) =>
      current && collections.some((c) => c.id === current) ? current : null,
    )
  }, [collections])

  useEffect(() => {
    setSelected(new Set())
    setFocusId('')
    setQuery('')
    setFilter('all')
    setResultFilter('all')
  }, [collectionId])

  useEffect(() => {
    if (view !== 'library' || !openedCollectionId) {
      setInspectorOverlayOpen(false)
    }
  }, [view, openedCollectionId])

  const effectiveInspectorOverlayOpen =
    inspectorOverlayOpen && view === 'library' && Boolean(openedCollectionId)

  const goHome = useCallback(() => {
    setShowGuide(false)
    setView('welcome')
  }, [])

  const openCollection = useCallback((id: string) => {
    setCollectionId(id)
    setOpenedCollectionId(id)
    setView('library')
  }, [])

  const selectCollection = useCallback((id: string) => {
    setCollectionId(id)
    setOpenedCollectionId(id)
  }, [])

  const openCollectionsOverview = useCallback(() => {
    setOpenedCollectionId(null)
    setView('library')
  }, [])

  const openReviewQueue = useCallback(
    (decision: LibraryFilter, result: 'all' | SearchResultGroup, targetId?: string) => {
      setFilter(decision)
      setResultFilter(result)
      setQuery('')
      setSelected(new Set())
      setFocusId('')
      if (targetId) setOpenedCollectionId(targetId)
      setView('library')
    },
    [],
  )

  return {
    view,
    setView,
    showGuide,
    setShowGuide,
    collectionId,
    setCollectionId,
    openedCollectionId,
    setOpenedCollectionId,
    inspectorOverlayOpen: effectiveInspectorOverlayOpen,
    setInspectorOverlayOpen,
    focusId,
    setFocusId,
    query,
    setQuery,
    filter,
    setFilter,
    resultFilter,
    setResultFilter,
    selected,
    setSelected,
    goHome,
    openCollection,
    selectCollection,
    openCollectionsOverview,
    openReviewQueue,
  }
}
