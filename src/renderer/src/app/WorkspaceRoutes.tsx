import { LoaderCircle } from 'lucide-react'
import { lazy, Suspense, useCallback } from 'react'
import type { LibraryFilter } from '../../../core/library'
import type { SearchResultGroup } from '../../../core/matching'
import type { ExportFormat, Settings } from '../../../shared/types'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import CollectionsOverview from '../features/collections/CollectionsOverview'
import LibraryView from '../features/library/LibraryView'
import StartPage from '../features/start/StartPage'
import { api } from '../state/api'
import type { WorkspaceController } from './useWorkspaceController'

const Welcome = lazy(() => import('../features/start/Welcome'))
const ConnectionsView = lazy(() => import('../features/connections/ConnectionsView'))
const JobsView = lazy(() => import('../features/jobs/JobsView'))
const SettingsView = lazy(() => import('../features/settings/SettingsView'))

export function WorkspaceRoutes({ controller }: { controller: WorkspaceController }) {
  const {
    view,
    setView,
    showGuide,
    setShowGuide,
    goHome,
    openCollection,
    selectCollection,
    openCollectionsOverview,
    openReviewQueue,
    recentExportId,
    setRecentExportId,
    openedCollectionId,
    setOpenedCollectionId,
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
    vkExpected,
    setVKExpected,
    vkProgress,
    setNotice,
    busy,
    setConfirmTransfer,
    data,
    vkExpectedCount,
    invalidVKCount,
    run,
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
    openVK,
    cancelVKExtraction,
    extractVKPreview,
    prepareLocal,
  } = controller

  const handleStartVK = useCallback(() => {
    setView('connections')
    openVK()
  }, [openVK, setView])

  const handleStartLibrary = useCallback(() => {
    if (collection) setOpenedCollectionId(collection.id)
    setView('library')
  }, [collection, setOpenedCollectionId, setView])

  const handleStartReview = useCallback(
    (decision: LibraryFilter, result: 'all' | SearchResultGroup) => {
      openReviewQueue(decision, result, collection?.id)
    },
    [collection?.id, openReviewQueue],
  )

  const handleStartBrowser = useCallback(() => openSpotifyPanel(), [openSpotifyPanel])

  const handleStartTransfer = useCallback(() => {
    if (!data) return
    setView(data.spotify.connected ? 'library' : 'connections')
    if (data.spotify.connected) setConfirmTransfer(true)
  }, [data, setConfirmTransfer, setView])

  const handleShowGuide = useCallback(() => setShowGuide(true), [setShowGuide])
  const handleGoJobs = useCallback(() => setView('jobs'), [setView])
  const handleGoConnections = useCallback(() => setView('connections'), [setView])
  const handleGoLibrary = useCallback(() => setView('library'), [setView])

  const handleGuideNavigate = useCallback(
    (destination: 'library' | 'collections' | 'connections' | 'jobs') => {
      if (destination === 'collections') {
        openCollectionsOverview()
        return
      }
      if (destination === 'library') {
        setOpenedCollectionId(collection?.id ?? null)
      }
      setView(destination)
    },
    [collection?.id, openCollectionsOverview, setOpenedCollectionId, setView],
  )

  const handleImport = useCallback(() => {
    void importFile()
  }, [importFile])

  const handleDismissRecentExport = useCallback(() => setRecentExportId(null), [setRecentExportId])

  const handleLibraryTransfer = useCallback(() => {
    if (data?.spotify.connected) setConfirmTransfer(true)
    else setView('connections')
  }, [data?.spotify.connected, setConfirmTransfer, setView])

  const handleUndo = useCallback(() => {
    if (openedCollectionId) void run('undo', () => api.undo(openedCollectionId))
  }, [openedCollectionId, run])

  const handleControlJob = useCallback(
    (id: string, action: 'pause' | 'resume') => {
      void run('control', () => api.controlJob(id, action))
    },
    [run],
  )

  const handleOpenExternal = useCallback(
    (url: string) => {
      void run('link', () => api.openExternal(url))
    },
    [run],
  )

  const handleBackToOverview = useCallback(
    () => setOpenedCollectionId(null),
    [setOpenedCollectionId],
  )

  const handleExportCollection = useCallback(
    (id: string, format: ExportFormat) => exported(format, id),
    [exported],
  )

  const handleClearVK = useCallback(
    () => void run('vk-clear', () => api.clearVK(), 'Сессия VK очищена.'),
    [run],
  )

  const handleSaveVKSettings = useCallback(
    (value: Settings) =>
      void run('settings', () => api.saveSettings(value), 'Настройки сети VK сохранены.'),
    [run],
  )

  const handleSaveSpotifySettings = useCallback(
    (value: Settings) =>
      void run('settings', () => api.saveSettings(value), 'Настройки Spotify сохранены.'),
    [run],
  )

  const handleConnectSpotify = useCallback(
    () => void run('connect', () => api.connectSpotify(), 'Spotify подключён.'),
    [run],
  )

  const handleDisconnectSpotify = useCallback(
    () => void run('disconnect', () => api.disconnectSpotify(), 'Spotify отключён.'),
    [run],
  )

  const handleOpenSpotifyDev = useCallback(
    () => void run('link', () => api.openExternal('https://developer.spotify.com/dashboard')),
    [run],
  )

  const handleOpenSpotifyHelper = useCallback(
    () => void run('helper', () => api.helper('open-spotify')),
    [run],
  )

  const handleInspectHelper = useCallback(
    () =>
      void run('inspect', () => api.helper('inspect')).then((text) => {
        if (text) {
          setNotice({
            message: 'Диагностика: ' + text.slice(0, 1200),
            error: false,
          })
        }
      }),
    [run, setNotice],
  )

  const handleArchiveFinishedJobs = useCallback(
    () =>
      void run(
        'archive-jobs',
        () => api.archiveFinishedJobs(),
        'Завершённые задания архивированы.',
      ),
    [run],
  )

  const handleArchiveJob = useCallback(
    (id: string) => void run('archive-job', () => api.archiveJob(id)),
    [run],
  )

  const handlePauseJob = useCallback(
    (id: string) => void run('pause', () => api.controlJob(id, 'pause')),
    [run],
  )

  const handleResumeJob = useCallback(
    (id: string) => void run('resume', () => api.controlJob(id, 'resume')),
    [run],
  )

  const handleContinueSearchInBrowser = useCallback(
    (id: string) => continueSearch(id, true),
    [continueSearch],
  )

  const handleOpenPlaylist = useCallback(
    (playlistId: string) =>
      void run('link', () => api.openExternal(`https://open.spotify.com/playlist/${playlistId}`)),
    [run],
  )

  const handleReconcileMixed = useCallback(
    (id: string) => void run('mixed', () => api.reconcileMixed(id), 'Смешанный порядок сверён.'),
    [run],
  )

  const handleRecoverPlaylist = useCallback(
    (jobId: string, playlistId: string) =>
      void run(
        'recover',
        () => api.recoverPlaylist(jobId, playlistId),
        'Плейлист сверён. Теперь можно продолжить.',
      ),
    [run],
  )

  const handleSaveSettings = useCallback(
    (value: Settings) =>
      void run('settings', () => api.saveSettings(value), 'Настройки сохранены.'),
    [run],
  )

  const openedCollection =
    view === 'library' && openedCollectionId
      ? data?.collections.find((c) => c.id === openedCollectionId)
      : undefined

  return (
    <ErrorBoundary
      resetKey={`${view}:${showGuide ? 'guide' : 'main'}:${openedCollectionId ?? ''}`}
      onReset={goHome}
    >
      <Suspense
        fallback={
          <div className="loading" role="status">
            Открываем раздел…
          </div>
        }
      >
        {!data ? (
          <div className="loading" role="status">
            <LoaderCircle className="spinning" size={24} aria-hidden="true" />
            Открываем локальную библиотеку…
          </div>
        ) : (
          <>
            {view === 'welcome' && !showGuide && (
              <StartPage
                data={data}
                collection={collection}
                busy={!!busy}
                onImport={handleImport}
                onVK={handleStartVK}
                onLibrary={handleStartLibrary}
                onCollections={openCollectionsOverview}
                onSelectCollection={selectCollection}
                onReview={handleStartReview}
                onSearch={beginSearch}
                onBrowser={handleStartBrowser}
                onResume={continueSearch}
                onTransfer={handleStartTransfer}
                onHelp={handleShowGuide}
                onJobs={handleGoJobs}
                onConnect={handleGoConnections}
              />
            )}
            {view === 'welcome' && showGuide && (
              <Suspense
                fallback={
                  <div role="status" className="loading">
                    Открываем руководство…
                  </div>
                }
              >
                <Welcome
                  theme={data.settings.theme}
                  hasCollection={!!collection}
                  busy={!!busy}
                  navigate={handleGuideNavigate}
                  importFile={handleImport}
                />
              </Suspense>
            )}
            {view === 'library' && !openedCollection && (
              <CollectionsOverview
                collections={data.collections}
                matchingRules={data.settings.matchingRules}
                onOpenCollection={openCollection}
                onRenameCollection={renameCollection}
                onDeleteCollection={deleteCollection}
                onReorderCollections={reorderCollections}
                onImportFile={handleImport}
                onExtractVK={extractVKPreview}
                onOpenVK={openVK}
                onOpenRepair={openRepair}
                onExportCollection={handleExportCollection}
                busy={busy}
              />
            )}
            {view === 'library' && openedCollection && (
              <LibraryView
                collection={openedCollection}
                collectionId={openedCollection.id}
                data={data}
                busy={busy}
                recentExportId={recentExportId}
                onDismissRecentExport={handleDismissRecentExport}
                counts={counts}
                focusId={focusId}
                onFocusIdChange={setFocusId}
                query={query}
                onQueryChange={setQuery}
                filter={filter}
                onFilterChange={setFilter}
                resultFilter={resultFilter}
                onResultFilterChange={setResultFilter}
                selected={selected}
                onSelectedChange={setSelected}
                onImportFile={handleImport}
                onOpenVK={handleGoConnections}
                onTransferClick={handleLibraryTransfer}
                onUndo={handleUndo}
                onOpenSpotifyPanel={openSpotifyPanel}
                onContinueSearch={continueSearch}
                onSearch={search}
                onControlJob={handleControlJob}
                onPatch={patch}
                onConfirmMetadata={confirmMetadata}
                onLinkFile={linkFile}
                onOpenExternal={handleOpenExternal}
                onBackToOverview={handleBackToOverview}
                onInspectorOverlayChange={setInspectorOverlayOpen}
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
                onOpenVK={openVK}
                onExtractVK={extractVKPreview}
                onClearVK={handleClearVK}
                onCancelVKExtraction={cancelVKExtraction}
                onSaveVKSettings={handleSaveVKSettings}
                onOpenSpotifyPanel={handleStartBrowser}
                onSaveSpotifySettings={handleSaveSpotifySettings}
                onConnectSpotify={handleConnectSpotify}
                onDisconnectSpotify={handleDisconnectSpotify}
                onOpenSpotifyDev={handleOpenSpotifyDev}
                onPrepareLocal={prepareLocal}
                onOpenSpotifyHelper={handleOpenSpotifyHelper}
                onInspectHelper={handleInspectHelper}
              />
            )}
            {view === 'jobs' && (
              <JobsView
                data={data}
                busy={busy}
                onArchiveFinishedJobs={handleArchiveFinishedJobs}
                onArchiveJob={handleArchiveJob}
                onPauseJob={handlePauseJob}
                onResumeJob={handleResumeJob}
                onContinueSearchInBrowser={handleContinueSearchInBrowser}
                onOpenSpotifyPanel={openSpotifyPanel}
                onOpenPlaylist={handleOpenPlaylist}
                onReconcileMixed={handleReconcileMixed}
                onRecoverPlaylist={handleRecoverPlaylist}
                onSetAutoResume={setAutoResume}
                onGoToLibrary={handleGoLibrary}
              />
            )}
            {view === 'settings' && (
              <SettingsView
                settings={data.settings}
                dataPath={data.dataPath}
                busy={busy}
                onSaveSettings={handleSaveSettings}
              />
            )}
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  )
}
