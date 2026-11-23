import { ArrowRight, History, House, Library, Link2, Music2, Settings2, Upload } from 'lucide-react'
import { ProjectIcon, SpotifyIcon, VKIcon } from '../components/brand/BrandIcons'
import SidebarStatus from '../components/sidebar/SidebarStatus'
import { findPausedBrowserJobId } from './browser-job'
import type { WorkspaceController } from './useWorkspaceController'

const count = (number: number) => number.toLocaleString('ru-RU')

export function AppSidebar({ controller }: { controller: WorkspaceController }) {
  const {
    view,
    setView,
    goHome,
    openCollection,
    openCollectionsOverview,
    spotifyPanel,
    inspectorOverlayOpen,
    openedCollectionId,
    busy,
    data,
    importFile,
    openSpotifyPanel,
    openVK,
  } = controller

  const runningJobsCount = data?.jobs.filter((j) => j.state === 'running').length ?? 0

  return (
    <aside className="sidebar" inert={!!spotifyPanel || inspectorOverlayOpen}>
      <button
        type="button"
        className="brand brand-link"
        onClick={goHome}
        aria-label="VKSpot — добро пожаловать"
      >
        <span className="brand-mark">
          <ProjectIcon size={44} />
        </span>
        <span>
          VK<span className="brand-light">Spot</span>
        </span>
      </button>
      <div className="connection-line">
        <span>
          <VKIcon size={18} />
          VK
        </span>
        <span className="line" />
        <ArrowRight size={14} aria-hidden="true" />
        <span>
          <SpotifyIcon size={18} />
          Spotify
        </span>
      </div>
      <nav aria-label="Разделы">
        {(
          [
            { id: 'welcome', title: 'Обзор', icon: House },
            { id: 'library', title: 'Коллекции', icon: Library },
            { id: 'connections', title: 'Подключения', icon: Link2 },
            { id: 'jobs', title: 'Задания', icon: History },
            { id: 'settings', title: 'Настройки', icon: Settings2 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            className={`nav-button ${view === item.id ? 'active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => {
              if (item.id === 'library') {
                openCollectionsOverview()
                return
              }
              if (item.id === 'welcome') {
                goHome()
                return
              }
              setView(item.id)
            }}
          >
            <item.icon size={18} aria-hidden="true" />
            <span>{item.title}</span>
            {item.id === 'jobs' && runningJobsCount > 0 && <span className="nav-dot" />}
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
            onClick={() => openCollection(c.id)}
          >
            <Music2 size={15} aria-hidden="true" />
            <span>{c.name}</span>
            <small>{count(c.rows.length)}</small>
          </button>
        ))}
        <button className="add-collection" onClick={() => void importFile()} disabled={!!busy}>
          <Upload size={15} aria-hidden="true" />
          Импортировать список
        </button>
      </div>
      <SidebarStatus
        data={data}
        onSpotify={() => {
          if (data?.spotifyBrowser?.state === 'attention') {
            openSpotifyPanel(findPausedBrowserJobId(data.jobs))
          } else if (data?.settings.searchProvider === 'browser' && !data.spotify.connected) {
            openSpotifyPanel()
          } else {
            setView('connections')
          }
        }}
        onVK={openVK}
        onJobs={() => setView('jobs')}
      />
    </aside>
  )
}
