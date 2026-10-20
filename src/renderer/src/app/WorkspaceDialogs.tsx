import { reviewGroup } from '../../../core/matching'
import ImportDialog from '../features/collections/ImportDialog'
import { RepairDialog } from '../features/collections/RepairDialog'
import SpotifyPanel from '../features/connections/SpotifyPanel'
import { api } from '../state/api'
import TransferDialog from '../features/transfer/TransferDialog'

import type { WorkspaceController } from './useWorkspaceController'

export function WorkspaceDialogs({ controller }: { controller: WorkspaceController }) {
  const {
    setView,
    spotifyPanel,
    setSpotifyPanel,
    setRecentExportId,
    collectionId,
    setCollectionId,
    setOpenedCollectionId,
    repairTarget,
    setRepairTarget,
    repairPreview,
    setRepairPreview,
    preview,
    setPreview,
    vkProgress,
    setNotice,
    busy,
    confirmTransfer,
    setConfirmTransfer,
    data,
    readState,
    vkExpectedCount,
    run,
    counts,
    continueSearch,
    confirmRepair,
  } = controller
  return (
    <>
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
                const state = readState()
                if (
                  state &&
                  !state.jobs.some((job) => job.state === 'running' || job.state === 'pausing') &&
                  (state.settings.searchProvider === 'browser' || state.spotify.connected)
                ) {
                  const r = state.collections.find((entry) => entry.id === id)?.rows ?? []
                  const pending = r
                    .filter((row) => reviewGroup(row, state.settings.matchingRules) === 'pending')
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
    </>
  )
}
