import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Database,
  History,
  House,
  Library,
  Link2,
  LoaderCircle,
  Music2,
  Settings2,
  Upload,
  X,
} from 'lucide-react'
import type {
  AppState,
  Bridge,
  Collection,
  ImportPreview,
  Result,
  Working,
  VKExportProgress,
} from '../../shared/model'
import Welcome from './Welcome'
import StartPage from './StartPage'
import SidebarStatus from './SidebarStatus'
import SpotifyPanel from './SpotifyPanel'
import IconButton from './IconButton'
import ConnectionsView from './ConnectionsView'
import JobsView from './JobsView'
import ArchiveView from './ArchiveView'
import SettingsView from './SettingsView'
import ImportDialog from './ImportDialog'
import TransferDialog from './TransferDialog'
import LibraryView, { type Filter, type Draft } from './LibraryView'
import { CollectionsOverview } from './CollectionsOverview'
import { RepairDialog } from './RepairDialog'
import useRetryClock from './useRetryClock'
import { retryDeadline } from '../../shared/job-status'
import { reviewGroup, type ReviewGroup } from '../../core/matching'
import { ProjectIcon, SpotifyIcon, VKIcon } from './BrandIcons'

const api: Bridge = window.vkspot
type View = 'welcome' | 'library' | 'connections' | 'jobs' | 'archive' | 'settings'

const count = (number: number) => number.toLocaleString('ru-RU')

export default function App() {
  const [data, setData] = useState<AppState | null>(null)
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

  const jobNow = useRetryClock(view === 'jobs' ? retryDeadline(data?.jobs ?? []) : 0)
  const [collectionId, setCollectionId] = useState('')
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<Collection | null>(null)
  const [repairPreview, setRepairPreview] = useState<ImportPreview | null>(null)
  const [focusId, setFocusId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [resultFilter, setResultFilter] = useState<'all' | ReviewGroup>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [vkExpected, setVKExpected] = useState('')
  const [vkProgress, setVKProgress] = useState<VKExportProgress | null>(null)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  const sequence = useRef(0)
  const isRefreshingRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      pendingRefreshRef.current = true
      return
    }
    isRefreshingRef.current = true
    try {
      const request = ++sequence.current
      const result = await api.state()
      if (request !== sequence.current) return
      if (!result.ok) {
        setNotice({ message: result.error, error: true })
        return
      }
      setData(result.value)
      setCollectionId((current) =>
        result.value.collections.some((c) => c.id === current)
          ? current
          : (result.value.collections[0]?.id ?? ''),
      )
      setOpenedCollectionId((current) =>
        current && result.value.collections.some((c) => c.id === current) ? current : null,
      )
    } finally {
      isRefreshingRef.current = false
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = setTimeout(() => {
          void refresh()
        }, 150)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = api.onChange(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void refresh()
      }, 100)
    })
    return () => {
      unsub()
      if (debounceTimer) clearTimeout(debounceTimer)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [refresh])

  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? 'light'
  }, [data?.settings.theme])

  useEffect(() => api.onVKProgress(setVKProgress), [])

  const vkExpectedCount = vkExpected.trim() ? Number(vkExpected) : null
  const invalidVKCount =
    vkExpectedCount !== null &&
    (!Number.isSafeInteger(vkExpectedCount) || vkExpectedCount < 1 || vkExpectedCount > 1_000_000)

  const run = useCallback(
    async <T,>(
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

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: collection?.rows.length ?? 0,
      unresolved: 0,
      spotify: 0,
      local: 0,
      'local-pending': 0,
      excluded: 0,
      blocked: 0,
    }
    for (const row of collection?.rows ?? []) {
      const rowStatus: Filter = row.working.excluded
        ? 'excluded'
        : row.working.localPending && row.working.destination === 'unresolved'
          ? 'local-pending'
          : row.working.destination
      result[rowStatus]++
      if (row.source.availability === 'blocked') result.blocked++
    }
    return result
  }, [collection])

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
    void run('search', () => api.startSearch(targetCollId, ids, background))
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
    const result = await api.state()
    return (
      result.ok &&
      result.value.collections
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

  return (
    <div className="app">
      <aside className="sidebar" inert={!!spotifyPanel}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            setShowGuide(false)
            setView('welcome')
          }}
          aria-label="VKSpot — добро пожаловать"
        >
          <span className="brand-mark">
            <ProjectIcon size={44} />
          </span>
          <span>
            VK<span className="brand-light">Spot</span>
          </span>
        </a>
        <div className="connection-line">
          <span>
            <VKIcon size={18} />
            VK
          </span>
          <span className="line" />
          <ArrowRight size={14} />
          <span>
            <SpotifyIcon size={18} />
            Spotify
          </span>
        </div>
        <nav aria-label="Разделы">
          {(
            [
              { id: 'welcome', title: 'Начало', icon: House },
              { id: 'library', title: 'Коллекция', icon: Library },
              { id: 'connections', title: 'Подключения', icon: Link2 },
              { id: 'jobs', title: 'Задания', icon: History },
              { id: 'archive', title: 'Архив и экспорт', icon: Database },
              { id: 'settings', title: 'Настройки', icon: Settings2 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-button ${view === item.id ? 'active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => {
                if (item.id === 'library') setOpenedCollectionId(null)
                if (item.id === 'welcome') setShowGuide(false)
                setView(item.id)
              }}
            >
              <item.icon size={18} aria-hidden="true" />
              <span>{item.title}</span>
              {item.id === 'jobs' && !!data?.jobs.filter((j) => j.state === 'running').length && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="collection-nav">
          <div className="sidebar-label">
            Мои коллекции <span>{data?.collections.length ?? 0}</span>
          </div>
          {data?.collections.map((c) => (
            <button
              key={c.id}
              className={view === 'library' && c.id === openedCollectionId ? 'current' : ''}
              onClick={() => {
                setCollectionId(c.id)
                setOpenedCollectionId(c.id)
                setView('library')
              }}
            >
              <Music2 size={15} />
              <span>{c.name}</span>
              <small>{count(c.rows.length)}</small>
            </button>
          ))}
          <button className="add-collection" onClick={() => void importFile()} disabled={!!busy}>
            <Upload size={15} />
            Импортировать список
          </button>
        </div>
        <SidebarStatus
          data={data}
          onSpotify={() => {
            if (data?.spotifyBrowser?.state === 'attention') {
              const job = [...data.jobs]
                .filter(
                  (item) =>
                    item.kind === 'search' &&
                    item.searchProvider === 'browser' &&
                    item.state === 'paused',
                )
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
              openSpotifyPanel(job?.id)
            } else if (data?.settings.searchProvider === 'browser' && !data.spotify.connected)
              openSpotifyPanel()
            else {
              setView('connections')
            }
          }}
          onVK={() => {
            void api
              .openVK()
              .then((result) => {
                if (!result.ok) setNotice({ message: result.error, error: true })
              })
              .catch(() =>
                setNotice({ message: 'Не удалось открыть VK. Повтори действие.', error: true }),
              )
          }}
          onJobs={() => setView('jobs')}
        />
      </aside>
      <main className="workspace" inert={!!spotifyPanel}>
        {notice && (
          <div
            className={`notice ${notice.error ? 'error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
          >
            <span>{notice.message}</span>
            <IconButton title="Закрыть сообщение" onClick={() => setNotice(null)}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {data?.spotifyBrowser?.state === 'attention' &&
          !spotifyPanel &&
          data.spotifyBrowser.message !== dismissedHelp && (
            <div className="context-help" role="status">
              <span>
                {data.spotifyBrowser.reason === 'verification'
                  ? 'Spotify просит войти или пройти проверку.'
                  : data.spotifyBrowser.reason === 'load'
                    ? 'Не удалось загрузить страницу Spotify.'
                    : 'Не удалось прочитать результаты Spotify.'}
              </span>
              <button
                onClick={() =>
                  openSpotifyPanel(
                    [...data.jobs]
                      .filter(
                        (job) =>
                          job.kind === 'search' &&
                          job.searchProvider === 'browser' &&
                          job.state === 'paused',
                      )
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id,
                  )
                }
              >
                Открыть Spotify здесь <ArrowRight size={15} />
              </button>
              <IconButton
                title="Скрыть подсказку"
                onClick={() => setDismissedHelp(data.spotifyBrowser!.message)}
              >
                <X size={16} />
              </IconButton>
            </div>
          )}
        {!data ? (
          <div className="loading" role="status">
            <LoaderCircle size={24} />
            Открываем локальную библиотеку…
          </div>
        ) : (
          <>
            {view === 'welcome' && !showGuide && (
              <StartPage
                data={data}
                collection={collection}
                busy={!!busy}
                onImport={() => void importFile()}
                onVK={() => {
                  setView('connections')
                  void run('vk', () => api.openVK())
                }}
                onLibrary={() => {
                  if (collection) setOpenedCollectionId(collection.id)
                  setView('library')
                }}
                onSearch={beginSearch}
                onBrowser={() => openSpotifyPanel()}
                onResume={continueSearch}
                onTransfer={() => {
                  setView(data.spotify.connected ? 'library' : 'connections')
                  if (data.spotify.connected) setConfirmTransfer(true)
                }}
                onHelp={() => setShowGuide(true)}
                onJobs={() => setView('jobs')}
                onConnect={() => {
                  setView('connections')
                }}
              />
            )}
            {view === 'welcome' && showGuide && (
              <Welcome
                theme={data.settings.theme}
                hasCollection={!!collection}
                busy={!!busy}
                navigate={(destination) => {
                  if (destination === 'library') {
                    setOpenedCollectionId(collection?.id ?? null)
                  }
                  setView(destination)
                }}
                importFile={() => void importFile()}
              />
            )}
            {view === 'library' &&
              (!openedCollectionId ||
                !data.collections.some((c) => c.id === openedCollectionId)) && (
                <CollectionsOverview
                  collections={data.collections}
                  onOpenCollection={(id) => {
                    setCollectionId(id)
                    setOpenedCollectionId(id)
                  }}
                  onRenameCollection={renameCollection}
                  onDeleteCollection={deleteCollection}
                  onReorderCollections={reorderCollections}
                  onImportFile={() => void importFile()}
                  onExtractVK={() =>
                    void run('extract', () =>
                      api.extractVK({ expectedCount: vkExpectedCount }),
                    ).then((value) => {
                      if (value) setPreview(value)
                    })
                  }
                  onOpenVK={() => {
                    void run('vk', () => api.openVK())
                  }}
                  onOpenRepair={openRepair}
                  onExportCollection={(id) => exported('archive', id)}
                  busy={busy}
                />
              )}
            {view === 'library' &&
              openedCollectionId &&
              data.collections.some((c) => c.id === openedCollectionId) && (
                <LibraryView
                  collection={data.collections.find((c) => c.id === openedCollectionId)}
                  collectionId={openedCollectionId}
                  data={data}
                  busy={busy}
                  recentExportId={recentExportId}
                  onDismissRecentExport={() => setRecentExportId(null)}
                  counts={counts}
                  focusId={focusId}
                  onFocusIdChange={setFocusId}
                  drafts={drafts}
                  onDraftsChange={setDrafts}
                  query={query}
                  onQueryChange={setQuery}
                  filter={filter}
                  onFilterChange={setFilter}
                  resultFilter={resultFilter}
                  onResultFilterChange={setResultFilter}
                  selected={selected}
                  onSelectedChange={setSelected}
                  onImportFile={() => void importFile()}
                  onOpenVK={() => setView('connections')}
                  onExportArchive={() => exported('archive', openedCollectionId)}
                  onTransferClick={() => {
                    if (data.spotify.connected) setConfirmTransfer(true)
                    else setView('connections')
                  }}
                  onUndo={() => void run('undo', () => api.undo(openedCollectionId))}
                  onAutoResumeChange={setAutoResume}
                  onOpenSpotifyPanel={openSpotifyPanel}
                  onContinueSearch={continueSearch}
                  onSearch={search}
                  onControlJob={(id, action) =>
                    void run('control', () => api.controlJob(id, action))
                  }
                  onPatch={patch}
                  onConfirmMetadata={confirmMetadata}
                  onLinkFile={linkFile}
                  onOpenExternal={(url) => void run('link', () => api.openExternal(url))}
                  onSaveSettings={(settings) =>
                    void run('settings', () => api.saveSettings(settings))
                  }
                  onBackToOverview={() => setOpenedCollectionId(null)}
                />
              )}
            {view === 'connections' && (
              <ConnectionsView
                data={data}
                busy={busy}
                collection={collection}
                vkExpected={vkExpected}
                onVKExpectedChange={setVKExpected}
                invalidVKCount={invalidVKCount}
                vkExpectedCount={vkExpectedCount}
                vkProgress={vkProgress}
                onOpenVK={() => void run('vk', () => api.openVK())}
                onExtractVK={() =>
                  void run('extract', () => api.extractVK({ expectedCount: vkExpectedCount })).then(
                    (value) => {
                      if (value) setPreview(value)
                    },
                  )
                }
                onClearVK={() => void run('vk-clear', () => api.clearVK(), 'Сессия VK очищена.')}
                onCancelVKExtraction={() =>
                  void api.cancelVKExtraction().then((result) => {
                    if (!result.ok) setNotice({ message: result.error, error: true })
                  })
                }
                onSaveVKSettings={(value) =>
                  void run(
                    'settings',
                    () => api.saveSettings(value),
                    'Настройки сети VK сохранены.',
                  )
                }
                onOpenSpotifyPanel={() => openSpotifyPanel()}
                onSaveSpotifySettings={(value) =>
                  void run(
                    'settings',
                    () => api.saveSettings(value),
                    'Настройки Spotify сохранены.',
                  )
                }
                onConnectSpotify={() =>
                  void run('connect', () => api.connectSpotify(), 'Spotify подключён.')
                }
                onDisconnectSpotify={() =>
                  void run('disconnect', () => api.disconnectSpotify(), 'Spotify отключён.')
                }
                onOpenSpotifyDev={() =>
                  void run('link', () =>
                    api.openExternal('https://developer.spotify.com/dashboard'),
                  )
                }
                onPrepareLocal={() =>
                  void run('prepare', () => api.prepareLocal(collectionId)).then((path) => {
                    if (path)
                      setNotice({
                        message: `Файлы и план сохранены: ${path}`,
                        error: false,
                      })
                  })
                }
                onOpenSpotifyHelper={() => void run('helper', () => api.helper('open-spotify'))}
                onInspectHelper={() =>
                  void run('inspect', () => api.helper('inspect')).then((text) => {
                    if (text)
                      setNotice({
                        message: 'Диагностика: ' + text.slice(0, 1200),
                        error: false,
                      })
                  })
                }
              />
            )}
            {view === 'jobs' && (
              <JobsView
                data={data}
                busy={busy}
                jobNow={jobNow}
                onArchiveFinishedJobs={() =>
                  void run(
                    'archive-jobs',
                    () => api.archiveFinishedJobs(),
                    'Завершённые задания архивированы.',
                  )
                }
                onArchiveJob={(id) => void run('archive-job', () => api.archiveJob(id))}
                onPauseJob={(id) => void run('pause', () => api.controlJob(id, 'pause'))}
                onResumeJob={(id) => void run('resume', () => api.controlJob(id, 'resume'))}
                onContinueSearchInBrowser={(id) => continueSearch(id, true)}
                onOpenSpotifyPanel={(jobId) => openSpotifyPanel(jobId)}
                onOpenPlaylist={(playlistId) =>
                  void run('link', () =>
                    api.openExternal(`https://open.spotify.com/playlist/${playlistId}`),
                  )
                }
                onReconcileMixed={(id) =>
                  void run('mixed', () => api.reconcileMixed(id), 'Смешанный порядок сверён.')
                }
                onRecoverPlaylist={(jobId, playlistId) =>
                  void run(
                    'recover',
                    () => api.recoverPlaylist(jobId, playlistId),
                    'Плейлист сверён. Теперь можно продолжить.',
                  )
                }
                onSetAutoResume={setAutoResume}
                onGoToLibrary={() => setView('library')}
              />
            )}
            {view === 'archive' && (
              <ArchiveView
                collection={collection}
                busy={busy}
                onExport={exported}
                onImportFile={() => void importFile()}
              />
            )}
            {view === 'settings' && (
              <SettingsView
                settings={data.settings}
                dataPath={data.dataPath}
                busy={busy}
                onSaveSettings={(value) =>
                  void run('settings', () => api.saveSettings(value), 'Настройки сохранены.')
                }
              />
            )}
          </>
        )}
        {busy && (
          <div className="activity" role="status">
            <LoaderCircle className="spinning" size={15} />
            {busy === 'extract'
              ? 'Собираем строки VK. Это может занять время…'
              : busy === 'connect'
                ? 'Подтверди вход в браузере…'
                : 'Выполняется…'}
          </div>
        )}
      </main>
      {spotifyPanel && (
        <SpotifyPanel
          browserState={data?.spotifyBrowser}
          onClose={() => setSpotifyPanel(null)}
          onResume={
            data?.jobs.some(
              (job) =>
                job.id === spotifyPanel.jobId &&
                job.kind === 'search' &&
                job.searchProvider === 'browser' &&
                job.state === 'paused',
            )
              ? () => {
                  const job = data.jobs.find((item) => item.id === spotifyPanel.jobId)
                  if (job) continueSearch(job.id, false)
                }
              : undefined
          }
        />
      )}
      <ImportDialog
        preview={preview}
        busy={busy}
        onClose={() => setPreview(null)}
        onSave={(item, searchAfterImport) => {
          void run('save-import', () => api.importCollection(item)).then(async (id) => {
            if (id) {
              setCollectionId(id)
              setOpenedCollectionId(id)
              setRecentExportId(id)
              setPreview(null)
              setView('library')
              if (searchAfterImport && !item.restored) {
                const state = await api.state()
                if (
                  state.ok &&
                  !state.value.jobs.some(
                    (job) => job.state === 'running' || job.state === 'pausing',
                  ) &&
                  (state.value.settings.searchProvider === 'browser' ||
                    state.value.spotify.connected)
                ) {
                  const r = state.value.collections.find((entry) => entry.id === id)?.rows ?? []
                  const pending = r
                    .filter(
                      (row) => reviewGroup(row, state.value.settings.matchingRules) === 'pending',
                    )
                    .map((row) => row.id)
                  if (pending.length) await run('search', () => api.startSearch(id, pending, true))
                }
              }
            }
          })
        }}
      />
      <RepairDialog
        collection={repairTarget}
        preview={repairPreview}
        busy={busy}
        vkStatus={data?.vk}
        vkProgress={vkProgress}
        onClose={() => {
          setRepairTarget(null)
          setRepairPreview(null)
        }}
        onSelectFile={async () => {
          const value = await run('import', () => api.previewImport())
          if (value) setRepairPreview(value)
        }}
        onOpenVK={() => {
          void run('vk', () => api.openVK())
        }}
        onExtractVK={async (options) => {
          const value = await run('extract', () =>
            api.extractVK(options ?? { expectedCount: vkExpectedCount }),
          )
          if (value) setRepairPreview(value)
        }}
        onCancelVKExtraction={() => {
          void api.cancelVKExtraction().then((result) => {
            if (!result.ok) setNotice({ message: result.error, error: true })
          })
        }}
        onConfirmRepair={confirmRepair}
      />
      <TransferDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        counts={counts}
        busy={busy}
        onConfirm={() =>
          void run('transfer', () => api.startTransfer(collectionId)).then((id) => {
            if (id) {
              setConfirmTransfer(false)
              setView('jobs')
            }
          })
        }
      />
    </div>
  )
}
