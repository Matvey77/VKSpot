import { useCallback } from 'react'
import ImportDialog from '../features/collections/ImportDialog'
import { RepairDialog } from '../features/collections/RepairDialog'
import SpotifyPanel from '../features/connections/SpotifyPanel'
import TransferDialog from '../features/transfer/TransferDialog'
import type { WorkspaceController } from './useWorkspaceController'

export function WorkspaceDialogs({ controller }: { controller: WorkspaceController }) {
  const {
    spotifyPanel,
    closeSpotifyPanel,
    repairTarget,
    repairPreview,
    closeRepair,
    selectRepairFile,
    extractVKForRepair,
    preview,
    setPreview,
    saveImport,
    vkProgress,
    busy,
    confirmTransfer,
    setConfirmTransfer,
    startTransfer,
    data,
    counts,
    continueSearch,
    confirmRepair,
    openVK,
    cancelVKExtraction,
  } = controller

  const closeImport = useCallback(() => setPreview(null), [setPreview])

  const hasPausedPanelJob = Boolean(
    spotifyPanel &&
    data?.jobs.some(
      (job) =>
        job.id === spotifyPanel.jobId &&
        job.kind === 'search' &&
        job.searchProvider === 'browser' &&
        job.state === 'paused',
    ),
  )

  const resumePanelJob = useCallback(() => {
    if (!spotifyPanel?.jobId) return
    const job = data?.jobs.find((item) => item.id === spotifyPanel.jobId)
    if (job) continueSearch(job.id, false)
  }, [continueSearch, data?.jobs, spotifyPanel?.jobId])

  return (
    <>
      {spotifyPanel && (
        <SpotifyPanel
          browserState={data?.spotifyBrowser}
          onClose={closeSpotifyPanel}
          onResume={hasPausedPanelJob ? resumePanelJob : undefined}
        />
      )}
      <ImportDialog
        preview={preview}
        busy={busy}
        onClose={closeImport}
        onSave={(item, searchAfterImport) => void saveImport(item, searchAfterImport)}
      />
      <RepairDialog
        collection={repairTarget}
        preview={repairPreview}
        busy={busy}
        vkStatus={data?.vk}
        vkProgress={vkProgress}
        onClose={closeRepair}
        onSelectFile={() => void selectRepairFile()}
        onOpenVK={openVK}
        onExtractVK={(options) => void extractVKForRepair(options)}
        onCancelVKExtraction={cancelVKExtraction}
        onConfirmRepair={(collId, previewItem) => void confirmRepair(collId, previewItem)}
      />
      <TransferDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        counts={counts}
        busy={busy}
        onConfirm={() => void startTransfer()}
      />
    </>
  )
}
