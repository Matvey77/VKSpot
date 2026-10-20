import { ArrowRight, LoaderCircle, X } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { useWorkspaceController } from './useWorkspaceController'
import { WorkspaceDialogs } from './WorkspaceDialogs'
import { WorkspaceRoutes } from './WorkspaceRoutes'
import IconButton from '../components/ui/IconButton'

export default function App() {
  const controller = useWorkspaceController()
  const {
    spotifyPanel,
    dismissedHelp,
    setDismissedHelp,
    notice,
    setNotice,
    busy,
    data,
    openSpotifyPanel,
  } = controller
  return (
    <div className="app">
      <AppSidebar controller={controller} />
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
        <WorkspaceRoutes controller={controller} />
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
      <WorkspaceDialogs controller={controller} />
    </div>
  )
}
