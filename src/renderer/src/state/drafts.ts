import { useCallback, useSyncExternalStore } from 'react'
import type { Working } from '../../../shared/types'

export type RowDraft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>

type Listener = () => void

const drafts = new Map<string, RowDraft>()
const listenersByRow = new Map<string, Set<Listener>>()

function emitRow(rowId: string): void {
  const set = listenersByRow.get(rowId)
  if (!set) return
  for (const listener of set) listener()
}

export const draftsStore = {
  get(rowId: string): RowDraft | undefined {
    return drafts.get(rowId)
  },
  set(rowId: string, draft: RowDraft | undefined): void {
    if (draft === undefined) {
      if (!drafts.has(rowId)) return
      drafts.delete(rowId)
    } else {
      drafts.set(rowId, draft)
    }
    emitRow(rowId)
  },
  clearRow(rowId: string): void {
    if (!drafts.delete(rowId)) return
    emitRow(rowId)
  },
  clearRows(rowIds: Iterable<string>): void {
    for (const id of rowIds) {
      if (drafts.delete(id)) emitRow(id)
    }
  },
  clearAll(): void {
    const keys = [...drafts.keys()]
    drafts.clear()
    for (const id of keys) emitRow(id)
  },
  subscribe(rowId: string, listener: Listener): () => void {
    let set = listenersByRow.get(rowId)
    if (!set) {
      set = new Set()
      listenersByRow.set(rowId, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) listenersByRow.delete(rowId)
    }
  },
}

export function clearCollectionDrafts(rowIds: Iterable<string>): void {
  draftsStore.clearRows(rowIds)
}

export function useRowDraft(
  rowId: string,
): [RowDraft | undefined, (draft: RowDraft | undefined) => void] {
  const subscribe = useCallback(
    (listener: Listener) => draftsStore.subscribe(rowId, listener),
    [rowId],
  )
  const getSnapshot = useCallback(() => draftsStore.get(rowId), [rowId])
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const setDraft = useCallback(
    (next: RowDraft | undefined) => draftsStore.set(rowId, next),
    [rowId],
  )
  return [draft, setDraft]
}
