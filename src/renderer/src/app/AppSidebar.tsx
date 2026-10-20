import {
  ArrowRight,
  Database,
  History,
  House,
  Library,
  Link2,
  Music2,
  Settings2,
  Upload,
} from 'lucide-react'
import { ProjectIcon, SpotifyIcon, VKIcon } from '../components/brand/BrandIcons'
import SidebarStatus from '../components/sidebar/SidebarStatus'
import { api } from '../state/api'

import type { WorkspaceController } from './useWorkspaceController'
const count = (number: number) => number.toLocaleString('ru-RU')

export function AppSidebar({ controller }: { controller: WorkspaceController }) {
  const {
    view,
    setView,
    setShowGuide,
    spotifyPanel,
    setCollectionId,
    openedCollectionId,
    setOpenedCollectionId,
    setNotice,
    busy,
    data,
    importFile,
    openSpotifyPanel,
  } = controller
  return (
    <>
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
    </>
  )
}
