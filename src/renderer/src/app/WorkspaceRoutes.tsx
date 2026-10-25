import { LoaderCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { CollectionsOverview } from '../features/collections/CollectionsOverview'
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
    recentExportId,
    setRecentExportId,
    collectionId,
    setCollectionId,
    openedCollectionId,
    setOpenedCollectionId,
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
    setPreview,
    vkExpected,
    setVKExpected,
    vkProgress,
    setNotice,
    busy,
    setConfirmTransfer,
    data,
    jobNow,
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
  } = controller
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Открываем раздел…
        </div>
      }
    >
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
              onCollections={() => {
                setOpenedCollectionId(null)
                setView('library')
              }}
              onSelectCollection={(id) => {
                setCollectionId(id)
                setOpenedCollectionId(id)
              }}
              onReview={(decision, result) => {
                setFilter(decision)
                setResultFilter(result)
                setQuery('')
                setSelected(new Set())
                setFocusId('')
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
                navigate={(destination) => {
                  if (destination === 'collections') {
                    setOpenedCollectionId(null)
                    setView('library')
                    return
                  }
                  if (destination === 'library') {
                    setOpenedCollectionId(collection?.id ?? null)
                  }
                  setView(destination)
                }}
                importFile={() => void importFile()}
              />
            </Suspense>
          )}
          {view === 'library' &&
            (!openedCollectionId || !data.collections.some((c) => c.id === openedCollectionId)) && (
              <CollectionsOverview
                collections={data.collections}
                matchingRules={data.settings.matchingRules}
                onOpenCollection={(id) => {
                  setCollectionId(id)
                  setOpenedCollectionId(id)
                }}
                onRenameCollection={renameCollection}
                onDeleteCollection={deleteCollection}
                onReorderCollections={reorderCollections}
                onImportFile={() => void importFile()}
                onExtractVK={() =>
                  void run('extract', () => api.extractVK({ expectedCount: vkExpectedCount })).then(
                    (value) => {
                      if (value) setPreview(value)
                    },
                  )
                }
                onOpenVK={() => {
                  void run('vk', () => api.openVK())
                }}
                onOpenRepair={openRepair}
                onExportCollection={(id, format) => exported(format, id)}
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
                onTransferClick={() => {
                  if (data.spotify.connected) setConfirmTransfer(true)
                  else setView('connections')
                }}
                onUndo={() => void run('undo', () => api.undo(openedCollectionId))}
                onOpenSpotifyPanel={openSpotifyPanel}
                onContinueSearch={continueSearch}
                onSearch={search}
                onControlJob={(id, action) => void run('control', () => api.controlJob(id, action))}
                onPatch={patch}
                onConfirmMetadata={confirmMetadata}
                onLinkFile={linkFile}
                onOpenExternal={(url) => void run('link', () => api.openExternal(url))}
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
                void run('settings', () => api.saveSettings(value), 'Настройки сети VK сохранены.')
              }
              onOpenSpotifyPanel={() => openSpotifyPanel()}
              onSaveSpotifySettings={(value) =>
                void run('settings', () => api.saveSettings(value), 'Настройки Spotify сохранены.')
              }
              onConnectSpotify={() =>
                void run('connect', () => api.connectSpotify(), 'Spotify подключён.')
              }
              onDisconnectSpotify={() =>
                void run('disconnect', () => api.disconnectSpotify(), 'Spotify отключён.')
              }
              onOpenSpotifyDev={() =>
                void run('link', () => api.openExternal('https://developer.spotify.com/dashboard'))
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
    </Suspense>
  )
}
