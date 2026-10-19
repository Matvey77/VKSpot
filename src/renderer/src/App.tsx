import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  Database,
  Download,
  FileAudio,
  FileJson,
  FolderOpen,
  History,
  Info,
  Library,
  Link2,
  ListFilter,
  LoaderCircle,
  Music2,
  House,
  Pause,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import type {
  AppState,
  Bridge,
  ImportPreview,
  Result,
  TrackRow,
  Working,
  VKExportProgress,
} from '../../shared/model'
import Welcome from './Welcome'
import ReviewWorkspace from './ReviewWorkspace'
import TabList from './TabList'
import ExplainedButton from './ExplainedButton'
import useRetryClock from './useRetryClock'
import {
  autoSearch,
  jobMessage,
  resumeDisabledReason,
  retryDeadline,
} from '../../shared/job-status'
import { reviewGroup, reviewLabels, type ReviewGroup } from '../../core/matching'
import SearchControls from './SearchControls'
import StartPage from './StartPage'
import SidebarStatus from './SidebarStatus'
import SpotifyPanel from './SpotifyPanel'
import { TrackTable, Inspector } from './CollectionTable'
import { SpotifySettings, Preferences, PlaylistRecovery, VKSettings } from './SettingsForms'
import { ProjectIcon, SpotifyIcon, VKIcon } from './BrandIcons'

const api: Bridge = window.vkspot
type View = 'welcome' | 'library' | 'connections' | 'jobs' | 'archive' | 'settings'
type Draft = Pick<Working, 'artist' | 'title' | 'version' | 'note'>
type Filter = 'all' | 'unresolved' | 'spotify' | 'local' | 'local-pending' | 'excluded' | 'blocked'
const labels: Record<Filter, string> = {
  all: 'Все записи',
  unresolved: 'Нужен выбор',
  spotify: 'Spotify',
  local: 'Локальные',
  'local-pending': 'Нужен локальный файл',
  excluded: 'Исключённые',
  blocked: 'Недоступные в VK',
}
const count = (number: number) => number.toLocaleString('ru-RU')
function status(row: TrackRow): Filter {
  return row.working.excluded
    ? 'excluded'
    : row.working.localPending && row.working.destination === 'unresolved'
      ? 'local-pending'
      : row.working.destination
}
function IconButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      className="icon-button"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function CompletenessNotice({
  completeness,
  totalCount,
  onDismiss,
}: {
  completeness: { expected: number | null; message: string; status: string }
  totalCount: number
  onDismiss: () => void
}) {
  const msg = completeness.message || ''

  let title: string
  let badge: string
  let explanation: string
  let hint: string

  if (completeness.expected !== null && msg.includes('из ожидаемых')) {
    title = `Собрано ${totalCount} из ${completeness.expected} ожидаемых записей`
    badge = 'Частичный список'
    explanation = `При импорте ожидалось ${completeness.expected} записей, но получено ${totalCount}.`
    hint = 'Проверьте, нет ли скрытых или недоступных записей в VK.'
  } else if (msg.includes('Сбор остановлен пользователем')) {
    title = `Сбор остановлен пользователем (${totalCount} записей)`
    badge = 'Остановлено'
    explanation = 'Выгрузка была остановлена до достижения конца страницы.'
    hint = 'Если вам нужны все треки, вы можете запустить импорт списка повторно.'
  } else if (msg.includes('предел времени') || msg.includes('таймаут')) {
    title = `Достигнут предел времени выгрузки (${totalCount} записей)`
    badge = 'Таймаут VK'
    explanation = 'Страница VK долго не отдавала новые строки при автоматической прокрутке.'
    hint = 'Проверьте интернет-соединение или повторите выгрузку при стабильной сети.'
  } else if (msg.includes('непрерывный порядок') || msg.includes('пропущенные')) {
    title = 'Возможен пропуск записей при прокрутке'
    badge = 'Внимание'
    explanation = 'При автоматической прокрутке страницы произошёл скачок ленты треков.'
    hint = 'Рекомендуем сверить первые и последние записи списка с музыкой в VK.'
  } else if (msg.includes('изменилась страница')) {
    title = 'Страница VK изменилась во время выгрузки'
    badge = 'Прервано'
    explanation = 'Во время сбора треков произошел переход на другой раздел VK.'
    hint = 'При необходимости повторите выгрузку, оставаясь в разделе «Моя музыка».'
  } else {
    title = 'Список выгружен до конца страницы'
    badge = 'Счётчик VK не указан'
    explanation = `Лента аудиозаписей прокручена до самого низа, сохранено ${totalCount} записей. VK не передал в коде страницы точное число всех аудиозаписей, поэтому автоматическая сверка количества не проводилась.`
    hint = `Вы можете сравнить число записей (${totalCount}) со счётчиком в «Моя музыка» в VK.`
  }

  return (
    <div className="completeness-notice-wrapper">
      <details className="review-source-status" open>
        <summary>
          <Info size={16} className="review-source-status-icon" />
          <span className="review-source-status-title">{title}</span>
          <span className="review-source-status-badge">{badge}</span>
          <button
            type="button"
            className="notice-dismiss-btn"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDismiss()
            }}
            aria-label="Закрыть уведомление"
            title="Закрыть уведомление"
          >
            <X size={14} />
          </button>
        </summary>
        <div className="review-source-status-content">
          <p className="review-source-status-desc">{explanation}</p>
          {hint && <p className="review-source-status-hint">💡 {hint}</p>}
        </div>
      </details>
    </div>
  )
}

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
  const [focusId, setFocusId] = useState('')
  const [libraryMode, setLibraryMode] = useState<'review' | 'table'>('table')
  const [reviewRowId, setReviewRowId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [resultFilter, setResultFilter] = useState<'all' | ReviewGroup>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [acceptUnverified, setAcceptUnverified] = useState(false)
  const [searchAfterImport, setSearchAfterImport] = useState(true)
  const [vkExpected, setVKExpected] = useState('')
  const [vkProgress, setVKProgress] = useState<VKExportProgress | null>(null)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const [inspectorLayout, setInspectorLayout] = useState<'parallel' | 'sequential'>(() => {
    const saved = localStorage.getItem('vkspot_inspector_layout')
    return (saved as 'parallel' | 'sequential') || 'parallel'
  })
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const saved = localStorage.getItem('vkspot_inspector_width')
    return saved ? Number(saved) : 660
  })

  const handleLayoutChange = useCallback(
    (mode: 'parallel' | 'sequential') => {
      setInspectorLayout(mode)
      localStorage.setItem('vkspot_inspector_layout', mode)
      if (mode === 'sequential' && inspectorWidth > 500) {
        setInspectorWidth(380)
        localStorage.setItem('vkspot_inspector_width', '380')
      } else if (mode === 'parallel' && inspectorWidth < 550) {
        setInspectorWidth(660)
        localStorage.setItem('vkspot_inspector_width', '660')
      }
    },
    [inspectorWidth],
  )

  const isDraggingRef = useRef(false)
  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = inspectorWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startX - moveEvent.clientX
      const newWidth = Math.min(Math.max(340, startWidth + delta), window.innerWidth - 380)
      setInspectorWidth(newWidth)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setInspectorWidth((w) => {
        localStorage.setItem('vkspot_inspector_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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
  useEffect(() => setAcceptUnverified(false), [preview?.tracks])
  const vkExpectedCount = vkExpected.trim() ? Number(vkExpected) : null
  const invalidVKCount =
    vkExpectedCount !== null &&
    (!Number.isSafeInteger(vkExpectedCount) || vkExpectedCount < 1 || vkExpectedCount > 1_000_000)
  const reviewVK = preview?.origin === 'VK DOM' && preview.completeness.status === 'unverified'
  const previewRows = preview?.tracks.map((track, index) => ({ track, position: index + 1 })) ?? []
  const previewSample =
    previewRows.length > 6 ? [...previewRows.slice(0, 3), ...previewRows.slice(-3)] : previewRows
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
  const collection = data?.collections.find((c) => c.id === collectionId)
  const focused = collection?.rows.find((r) => r.id === focusId)

  const reviewCacheRef = useRef<Map<string, { sig: string; group: ReviewGroup }>>(new Map())
  const prevRulesRef = useRef(data?.settings.matchingRules)

  const reviewStates = useMemo(() => {
    if (prevRulesRef.current !== data?.settings.matchingRules) {
      reviewCacheRef.current.clear()
      prevRulesRef.current = data?.settings.matchingRules
    }
    const cache = reviewCacheRef.current
    const rules = data?.settings.matchingRules
    const map = new Map<string, ReviewGroup>()
    if (!collection?.rows) return map
    for (const row of collection.rows) {
      const sig = `${row.working.destination}_${row.working.excluded ? 1 : 0}_${row.working.localPending ? 1 : 0}_${row.working.reviewDeferred ? 1 : 0}_${row.working.searchedQuery ?? ''}_${row.working.candidates.length}_${row.working.artist}_${row.working.title}_${row.working.version}`
      const cached = cache.get(row.id)
      if (cached && cached.sig === sig) {
        map.set(row.id, cached.group)
      } else {
        const group = reviewGroup(row, rules)
        cache.set(row.id, { sig, group })
        map.set(row.id, group)
      }
    }
    return map
  }, [collection, data?.settings.matchingRules])
  const baseRows = useMemo(
    () =>
      collection?.rows.filter((row) => {
        const inFilter =
          filter === 'all' ||
          (filter === 'blocked' ? row.source.availability === 'blocked' : status(row) === filter)
        const text = [
          row.working.artist,
          row.working.title,
          row.working.version,
          row.source.artist,
          row.source.title,
          row.source.id,
          row.working.note,
        ]
          .join(' ')
          .toLocaleLowerCase()
        return inFilter && text.includes(query.toLocaleLowerCase())
      }) ?? [],
    [collection, query, filter],
  )
  const rows = useMemo(
    () =>
      baseRows.filter((row) => resultFilter === 'all' || reviewStates.get(row.id) === resultFilter),
    [baseRows, resultFilter, reviewStates],
  )
  const resultCounts = useMemo(() => {
    const counts: Record<ReviewGroup, number> = {
      pending: 0,
      exact: 0,
      review: 0,
      missing: 0,
      'local-pending': 0,
      deferred: 0,
      ready: 0,
    }
    baseRows.forEach((row) => counts[reviewStates.get(row.id)!]++)
    return counts
  }, [baseRows, reviewStates])
  const searchCounts = useMemo(() => {
    const result = { pending: 0, resolved: 0 }
    for (const row of collection?.rows ?? []) {
      const group = reviewStates.get(row.id)
      if (group === 'pending') result.pending++
      if (group === 'ready') result.resolved++
    }
    return result
  }, [collection, reviewStates])
  const matchingRows = useMemo(
    () => baseRows.filter((row) => reviewStates.get(row.id) === 'exact'),
    [baseRows, reviewStates],
  )
  const selectedRows = useMemo(
    () => collection?.rows.filter((row) => selected.has(row.id)) ?? [],
    [collection, selected],
  )
  const selectedMatches = selectedRows.filter((row) => reviewStates.get(row.id) === 'exact')
  const hiddenSelected = selected.size - rows.filter((row) => selected.has(row.id)).length
  const counts = useMemo(() => {
    const result = {
      all: collection?.rows.length ?? 0,
      unresolved: 0,
      spotify: 0,
      local: 0,
      'local-pending': 0,
      excluded: 0,
      blocked: 0,
    }
    for (const row of collection?.rows ?? []) {
      result[status(row)]++
      if (row.source.availability === 'blocked') result.blocked++
    }
    return result
  }, [collection])
  const patch = async (ids: string[], value: Partial<Working>): Promise<boolean> => {
    const saved = await run('patch', async () => {
      const result = await api.patchRows(collectionId, ids, value)
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
  const search = (ids: string[], background = false) =>
    void run('search', () => api.startSearch(collectionId, ids, background))
  const setAutoResume = (value: boolean) => {
    if (data)
      void run('settings', () => api.saveSettings({ ...data.settings, autoResumeSearch: value }))
  }
  const beginSearch = () => {
    if (!collection) return
    setView('library')
    setLibraryMode('table')
    search(
      collection.rows.filter((row) => reviewStates.get(row.id) === 'pending').map((row) => row.id),
      true,
    )
  }
  const continueSearch = (id: string, browser: boolean) => {
    const job = data?.jobs.find((item) => item.id === id)
    if (job) setCollectionId(job.collectionId)
    setView('library')
    setLibraryMode('table')
    void run('control', () =>
      browser ? api.continueSearchInBrowser(id) : api.controlJob(id, 'resume'),
    )
  }
  const openSpotifyPanel = (jobId?: string) => {
    const relevant = data?.jobs.find(
      (job) =>
        job.collectionId === collectionId &&
        job.kind === 'search' &&
        job.searchProvider === 'browser' &&
        job.state !== 'complete',
    )
    setSpotifyPanel({ jobId: jobId ?? relevant?.id })
  }
  const openReviewRow = (id: string) => {
    setReviewRowId(id)
    setLibraryMode('review')
  }
  const confirmSelection = async () => {
    const ids = [...selected]
    const result = await run('confirm', () => api.confirmMetadataMatches(collectionId, ids))
    if (result !== undefined) {
      const applied = new Set(ids)
      setSelected((current) => new Set([...current].filter((id) => !applied.has(id))))
    }
  }
  const reviewPatch = async (ids: string[], value: Partial<Working>): Promise<boolean> => {
    const saved = await run('review', async () => {
      const result = await api.patchRows(collectionId, ids, value)
      return result.ok ? { ok: true as const, value: true } : result
    })
    return saved === true
  }
  const exported = (format: 'archive' | 'raw-json' | 'csv' | 'm3u8' | 'plan') =>
    void run('export', () => api.exportCollection(collectionId, format)).then((path) => {
      if (path) setNotice({ message: `Сохранено: ${path}`, error: false })
    })
  useEffect(() => {
    setSelected(new Set())
    setFocusId('')
    setLibraryMode('table')
    setReviewRowId('')
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
                if (item.id === 'library') setLibraryMode('table')
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
              className={c.id === collectionId ? 'current' : ''}
              onClick={() => {
                setCollectionId(c.id)
                setLibraryMode('table')
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
                  setLibraryMode('table')
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
                navigate={(destination, mode) => {
                  if (destination === 'library') {
                    setLibraryMode(mode ?? 'table')
                    setReviewRowId('')
                  }
                  setView(destination)
                }}
                importFile={() => void importFile()}
              />
            )}
            {view === 'library' && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>{collection?.name ?? 'Твоя музыка, целиком'}</h1>
                    <p>
                      {collection
                        ? `${count(collection.rows.length)} записей · исходный порядок сохранён`
                        : 'Сначала сохраним исходный список. Затем выберем путь для каждой записи.'}
                    </p>
                  </div>
                  <div className="heading-actions">
                    <button onClick={() => void importFile()} disabled={!!busy}>
                      <Upload size={16} />
                      Импорт списка
                    </button>
                    {!collection && (
                      <button className="primary" onClick={() => setView('connections')}>
                        <Link2 size={16} />
                        Открыть VK
                      </button>
                    )}
                  </div>
                </div>
                {!collection ? (
                  <section className="empty-library">
                    <div className="empty-path">
                      <span className="source-icon">
                        <VKIcon size={48} />
                      </span>
                      <span className="path-line" />
                      <FolderOpen size={36} />
                      <span className="path-line" />
                      <span className="destination-icon">
                        <SpotifyIcon size={44} />
                      </span>
                    </div>
                    <h2>Начни с полного списка</h2>
                    <p>
                      Импортируй JSON, CSV или TXT — либо открой свою музыку в VK. Повторы и
                      недоступные записи останутся в архиве.
                    </p>
                    <div className="empty-actions">
                      <button
                        className="primary"
                        onClick={() => void importFile()}
                        disabled={!!busy}
                      >
                        <Upload size={17} />
                        Выбрать файл
                      </button>
                      <button onClick={() => setView('connections')}>
                        Выгрузить из VK
                        <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="empty-footnotes">
                      <span>
                        <Check size={15} />
                        Исходные названия сохраняются
                      </span>
                      <span>
                        <Check size={15} />
                        Правки можно отменить
                      </span>
                      <span>
                        <Check size={15} />
                        Всё хранится локально
                      </span>
                    </div>
                  </section>
                ) : (
                  <>
                    {recentExportId === collection.id &&
                      collection.completeness.status === 'unverified' && (
                        <CompletenessNotice
                          completeness={collection.completeness}
                          totalCount={collection.rows.length}
                          onDismiss={() => setRecentExportId(null)}
                        />
                      )}
                    <div className="library-mode">
                      <TabList
                        id="collection-mode"
                        label="Режим работы с коллекцией"
                        value={libraryMode}
                        onChange={(mode) => {
                          setReviewRowId('')
                          setLibraryMode(mode)
                        }}
                        tabs={[
                          { value: 'table', label: 'Таблица' },
                          { value: 'review', label: 'Разбор коллекции' },
                        ]}
                      />
                      <div className="button-row library-actions">
                        <button
                          onClick={() => exported('archive')}
                          disabled={!!busy}
                          aria-label="Сохранить архив"
                          title="Сохранить архив"
                        >
                          <Download size={16} />
                          <span className="desktop-label">Сохранить архив</span>
                        </button>
                        <ExplainedButton
                          hintLabel="Перенос в Spotify"
                          hint={
                            data.spotify.connected
                              ? 'Проверить состав и создать приватный плейлист.'
                              : 'Для создания плейлиста подключи Spotify API. Поиск через страницу работает отдельно.'
                          }
                          reason={busy ? 'Дождись завершения текущего действия.' : undefined}
                          onClick={() => {
                            if (data.spotify.connected) setConfirmTransfer(true)
                            else {
                              setView('connections')
                            }
                          }}
                        >
                          {data.spotify.connected ? 'Проверить перенос' : 'Подключить для переноса'}{' '}
                          <ArrowRight size={16} />
                        </ExplainedButton>
                        <IconButton
                          title="Отменить последнюю правку"
                          disabled={!!busy}
                          onClick={() => void run('undo', () => api.undo(collectionId))}
                        >
                          <Undo2 size={18} />
                        </IconButton>
                      </div>
                    </div>
                    <div
                      id="collection-mode-panel"
                      role="tabpanel"
                      aria-labelledby={`collection-mode-tab-${libraryMode}`}
                      tabIndex={0}
                      className="library-panel"
                    >
                      {libraryMode === 'review' && (
                        <ReviewWorkspace
                          key={`${collection.id}:${reviewRowId}`}
                          initialRowId={reviewRowId}
                          autoResume={data.settings.autoResumeSearch}
                          onAutoResume={setAutoResume}
                          collection={collection}
                          jobs={data.jobs}
                          busy={!!busy}
                          connected={
                            data.settings.searchProvider === 'browser' || data.spotify.connected
                          }
                          searchProvider={data.settings.searchProvider}
                          onOpenBrowser={() => openSpotifyPanel()}
                          onBrowserResume={(id) => continueSearch(id, true)}
                          onSearch={search}
                          onControl={(id, action) =>
                            void run('control', () => api.controlJob(id, action))
                          }
                          onPatch={reviewPatch}
                          onConfirm={async (ids) =>
                            (await run('confirm', () =>
                              api.confirmMetadataMatches(collectionId, ids),
                            )) !== undefined
                          }
                          onLink={async (id) => {
                            await run('file', () => api.linkFile(collectionId, id))
                            const result = await api.state()
                            return (
                              result.ok &&
                              result.value.collections
                                .find((item) => item.id === collectionId)
                                ?.rows.find((item) => item.id === id)?.working.destination ===
                                'local'
                            )
                          }}
                          onEdit={(id) => {
                            setFocusId(id)
                            setLibraryMode('table')
                          }}
                          onExternal={(url) => void run('link', () => api.openExternal(url))}
                        />
                      )}
                      {libraryMode === 'table' && (
                        <div className="table-workspace">
                          <SearchControls
                            compact
                            collectionId={collection.id}
                            jobs={data.jobs}
                            busy={!!busy}
                            connected={
                              data.settings.searchProvider === 'browser' || data.spotify.connected
                            }
                            provider={data.settings.searchProvider}
                            onProvider={(searchProvider) =>
                              void run('settings', () =>
                                api.saveSettings({ ...data.settings, searchProvider }),
                              )
                            }
                            onOpenBrowser={() => openSpotifyPanel()}
                            onBrowserResume={(id) => continueSearch(id, true)}
                            pending={searchCounts.pending}
                            resolved={searchCounts.resolved}
                            total={collection.rows.length}
                            autoResume={data.settings.autoResumeSearch}
                            onAutoResume={setAutoResume}
                            onStart={() =>
                              search(
                                collection.rows
                                  .filter((row) => reviewStates.get(row.id) === 'pending')
                                  .map((row) => row.id),
                                true,
                              )
                            }
                            onControl={(id, action) =>
                              void run('control', () => api.controlJob(id, action))
                            }
                          />
                          <div className="library-tools">
                            <div className="search-input">
                              <Search size={17} />
                              <input
                                aria-label="Найти запись"
                                placeholder="Исполнитель, название или ID VK"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                              />
                            </div>
                            <div className="filter-select">
                              <ListFilter size={16} />
                              <select
                                aria-label="Статус записей"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as Filter)}
                              >
                                {Object.entries(labels).map(([key, name]) => (
                                  <option key={key} value={key}>
                                    {name} ({count(counts[key as Filter])})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <select
                              aria-label="Результат поиска"
                              value={resultFilter}
                              onChange={(event) =>
                                setResultFilter(event.target.value as typeof resultFilter)
                              }
                            >
                              <option value="all">Все результаты ({count(baseRows.length)})</option>
                              {Object.entries(reviewLabels).map(([group, label]) => (
                                <option key={group} value={group}>
                                  {label} ({count(resultCounts[group as ReviewGroup])})
                                </option>
                              ))}
                            </select>
                            {(query || filter !== 'all' || resultFilter !== 'all') && (
                              <IconButton
                                title="Сбросить фильтры"
                                onClick={() => {
                                  setQuery('')
                                  setFilter('all')
                                  setResultFilter('all')
                                }}
                              >
                                <X size={16} />
                              </IconButton>
                            )}
                          </div>
                          <div className="table-selection-tools">
                            <button
                              disabled={!rows.length || !!busy}
                              onClick={() => setSelected(new Set(rows.map((row) => row.id)))}
                            >
                              Выделить выборку ({count(rows.length)})
                            </button>
                            <ExplainedButton
                              hintLabel="Почему нельзя выделить совпадения"
                              reason={
                                busy
                                  ? 'Дождись завершения текущего действия.'
                                  : !matchingRows.length
                                    ? 'В этой выборке пока нет записей «Совпадают данные». Можно изменить фильтры или дождаться результатов поиска.'
                                    : undefined
                              }
                              onClick={() => {
                                setSelected(new Set(matchingRows.map((row) => row.id)))
                                setResultFilter('exact')
                              }}
                            >
                              Выделить совпадения ({count(matchingRows.length)})
                            </ExplainedButton>
                          </div>
                          {selected.size > 0 && (
                            <div className="selection-bar">
                              <span>
                                Выбрано {count(selected.size)}
                                {hiddenSelected > 0 && <> · вне выборки {count(hiddenSelected)}</>}
                              </span>
                              <ExplainedButton
                                className="primary"
                                hintLabel="Почему нельзя подтвердить выбранные совпадения"
                                hint="Подтверждаешь только выделенные записи. Название, исполнители и длительность совпадают; это сверка описаний, а не аудио. Группу можно отменить."
                                reason={
                                  busy
                                    ? 'Дождись завершения текущего действия.'
                                    : selectedMatches.length !== selected.size
                                      ? 'Для массового подтверждения выбери только записи «Совпадают данные». Используй кнопку «Выделить совпадения».'
                                      : undefined
                                }
                                onClick={() => void confirmSelection()}
                              >
                                Подтвердить выбранные ({count(selectedMatches.length)})
                              </ExplainedButton>
                              <select
                                aria-label="Действие с выбранными"
                                value=""
                                disabled={!!busy}
                                onChange={(event) => {
                                  if (event.target.value === 'exclude')
                                    patch([...selected], { excluded: true })
                                  if (event.target.value === 'include')
                                    patch([...selected], { excluded: false })
                                  if (event.target.value === 'defer')
                                    patch([...selected], { reviewDeferred: true })
                                  if (event.target.value === 'search') search([...selected])
                                }}
                              >
                                <option value="" disabled>
                                  Другие действия
                                </option>
                                <option value="exclude">Исключить</option>
                                <option value="include">Вернуть в перенос</option>
                                <option value="defer">Разобрать позже</option>
                                <option
                                  value="search"
                                  disabled={
                                    data.settings.searchProvider !== 'browser' &&
                                    !data.spotify.connected
                                  }
                                >
                                  Повторить поиск
                                </option>
                              </select>
                              <IconButton
                                title="Снять выделение"
                                onClick={() => setSelected(new Set())}
                              >
                                <X size={16} />
                              </IconButton>
                            </div>
                          )}
                          <div className={`collection-work ${focused ? 'with-inspector' : ''}`}>
                            <TrackTable
                              rows={rows}
                              selected={selected}
                              onSelect={setSelected}
                              focusedId={focusId}
                              onFocus={setFocusId}
                              onReview={openReviewRow}
                              resetKey={`${collectionId}:${query}:${filter}:${resultFilter}`}
                              matchingRules={data.settings.matchingRules}
                            />
                            {focused && (
                              <>
                                <div
                                  className="inspector-resizer"
                                  onMouseDown={handleInspectorResizeStart}
                                  title="Потяните для изменения ширины панели"
                                />
                                <Inspector
                                  key={focused.id}
                                  row={focused}
                                  draft={drafts[focused.id]}
                                  onDraftChange={(draft) =>
                                    setDrafts((current) => ({ ...current, [focused.id]: draft }))
                                  }
                                  busy={!!busy}
                                  spotifyConnected={
                                    data.settings.searchProvider === 'browser' ||
                                    data.spotify.connected
                                  }
                                  onClose={() => setFocusId('')}
                                  onPatch={(value) => patch([focused.id], value)}
                                  onLink={() =>
                                    void run('file', () => api.linkFile(collectionId, focused.id))
                                  }
                                  onSearch={() => search([focused.id])}
                                  onExternal={(url) =>
                                    void run('link', () => api.openExternal(url))
                                  }
                                  width={inspectorWidth}
                                  layout={inspectorLayout}
                                  onLayoutChange={handleLayoutChange}
                                />
                              </>
                            )}
                          </div>
                          <footer className="collection-footer">
                            <span>
                              {count(rows.length)} из {count(counts.all)} записей ·{' '}
                              {count(counts.excluded)} исключено, сохранено в списке
                            </span>
                          </footer>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            {view === 'connections' && (
              <div className="content-page">
                <h1>Подключения</h1>
                <p className="page-description">
                  Аккаунты нужны только для работы с платформами. Локальная коллекция доступна
                  отдельно.
                </p>
                <section className="connection-section">
                  <div className="section-symbol vk-symbol">
                    <VKIcon size={44} />
                  </div>
                  <div className="section-main">
                    <div className="heading-with-status">
                      <h2>VK Музыка</h2>
                      <span
                        className={`status-badge ${
                          data.vk?.state === 'connected'
                            ? 'connected'
                            : data.vk?.state === 'sign-in'
                              ? 'attention'
                              : data.vk?.state === 'error'
                                ? 'error'
                                : data.vk?.state === 'checking'
                                  ? 'checking'
                                  : 'unknown'
                        }`}
                      >
                        <span className="status-dot" />
                        {data.vk?.state === 'connected'
                          ? 'Подключён'
                          : data.vk?.state === 'sign-in'
                            ? 'Требуется вход'
                            : data.vk?.state === 'error'
                              ? 'Ошибка соединения'
                              : data.vk?.state === 'checking'
                                ? 'Проверка связи…'
                                : 'Не проверен'}
                      </span>
                    </div>
                    <p>
                      Войди в отдельном окне и открой «Моя музыка». Сбор начнётся с первой записи и
                      будет постепенно прокручивать список. Оставь окно VK открытым.
                    </p>
                    <label className="field vk-export-count">
                      Число записей в VK, если известно
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        placeholder="Необязательно"
                        value={vkExpected}
                        disabled={busy === 'extract'}
                        aria-invalid={invalidVKCount}
                        onChange={(event) => setVKExpected(event.target.value)}
                      />
                    </label>
                    {invalidVKCount && (
                      <p className="inline-warning">
                        Укажи целое число от 1 до 1 000 000 или оставь поле пустым.
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => void run('vk', () => api.openVK())}
                      >
                        Открыть VK
                        <ArrowRight size={16} />
                      </button>
                      <button
                        disabled={!!busy || invalidVKCount}
                        onClick={() =>
                          void run('extract', () =>
                            api.extractVK({ expectedCount: vkExpectedCount }),
                          ).then((value) => {
                            if (value) setPreview(value)
                          })
                        }
                      >
                        {busy === 'extract' ? (
                          <LoaderCircle className="spinning" size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                        Выгрузить мой список
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          void run('vk-clear', () => api.clearVK(), 'Сессия VK очищена.')
                        }
                      >
                        Выйти из VK
                      </button>
                    </div>
                    {busy === 'extract' && (
                      <div className="vk-extraction">
                        <div role="status" aria-live="polite">
                          <strong>
                            Собрано {count(vkProgress?.collected ?? 0)}
                            {(vkProgress?.expected ?? vkExpectedCount) !== null
                              ? ` из ${count((vkProgress?.expected ?? vkExpectedCount)!)}`
                              : ''}{' '}
                            записей
                          </strong>
                          <p>{vkProgress?.message ?? 'Возвращаемся к началу списка…'}</p>
                        </div>
                        <button
                          onClick={() =>
                            void api.cancelVKExtraction().then((result) => {
                              if (!result.ok) setNotice({ message: result.error, error: true })
                            })
                          }
                        >
                          Остановить сбор
                        </button>
                      </div>
                    )}
                    <p className="helper-text">
                      После выгрузки сравни количество и крайние записи. Заблокированные треки
                      сохраняются как записи списка; их файлы не обещаем восстановить.
                    </p>
                    <VKSettings
                      settings={data.settings}
                      busy={!!busy}
                      save={(value) =>
                        void run(
                          'settings',
                          () => api.saveSettings(value),
                          'Настройки сети VK сохранены.',
                        )
                      }
                    />
                  </div>
                </section>
                <section className="connection-section">
                  <div className="section-symbol spotify-symbol">
                    <SpotifyIcon size={44} />
                  </div>
                  <div className="section-main">
                    <div className="heading-with-status">
                      <h2>Spotify</h2>
                      <span
                        className={`status-badge ${data.spotify.connected ? 'connected' : 'unknown'}`}
                      >
                        <span className="status-dot" />
                        {data.spotify.connected
                          ? `Подключён (${data.spotify.name || 'Официальный API'})`
                          : 'Не подключён'}
                      </span>
                    </div>
                    <p>
                      Поиск через страницу Spotify работает внутри VKSpot. Если понадобится вход, он
                      откроется здесь же.
                    </p>
                    <button onClick={() => openSpotifyPanel()}>Открыть страницу Spotify</button>
                    <div className="spotify-api-block" style={{ marginTop: '20px' }}>
                      <h3 style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 600 }}>
                        Spotify API — подключение для переноса
                      </h3>
                      <SpotifySettings
                        settings={data.settings}
                        busy={!!busy}
                        connected={data.spotify.connected}
                        save={(value) =>
                          void run(
                            'settings',
                            () => api.saveSettings(value),
                            'Настройки Spotify сохранены.',
                          )
                        }
                        connect={() =>
                          void run('connect', () => api.connectSpotify(), 'Spotify подключён.')
                        }
                        disconnect={() =>
                          void run('disconnect', () => api.disconnectSpotify(), 'Spotify отключён.')
                        }
                      />
                      <button
                        className="text-button"
                        onClick={() =>
                          void run('link', () =>
                            api.openExternal('https://developer.spotify.com/dashboard'),
                          )
                        }
                      >
                        Открыть Spotify Developer
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </section>
                <section className="connection-section">
                  <div className="section-symbol neutral-symbol">
                    <FileAudio size={28} />
                  </div>
                  <div className="section-main">
                    <h2>Локальные файлы</h2>
                    <p>
                      Привяжи файл к записи в коллекции. Подготовка создаёт копии без
                      перекодирования и полный план порядка.
                    </p>
                    <div className="button-row">
                      <button
                        disabled={!collection || !!busy}
                        onClick={() =>
                          void run('prepare', () => api.prepareLocal(collectionId)).then((path) => {
                            if (path)
                              setNotice({
                                message: `Файлы и план сохранены: ${path}`,
                                error: false,
                              })
                          })
                        }
                      >
                        <FolderOpen size={16} />
                        Подготовить файлы
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => void run('helper', () => api.helper('open-spotify'))}
                      >
                        Открыть Spotify
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          void run('inspect', () => api.helper('inspect')).then((text) => {
                            if (text)
                              setNotice({
                                message: 'Диагностика: ' + text.slice(0, 1200),
                                error: false,
                              })
                          })
                        }
                      >
                        Проверить доступность управления
                      </button>
                    </div>
                    <details className="advanced-options">
                      <summary>Как работают локальные файлы</summary>
                      <p className="helper-text">
                        Добавление локальных файлов через API недоступно. Системное управление
                        проходит проверку; до её завершения файлы добавляются через приложение
                        Spotify.
                      </p>
                    </details>
                  </div>
                </section>
              </div>
            )}
            {view === 'jobs' && (
              <div className="content-page">
                <div
                  className="section-header-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px',
                  }}
                >
                  <div>
                    <h1>Задания</h1>
                    <p className="page-description">
                      Прогресс сохраняется на диске. После остановки перенос сверяет уже добавленные
                      записи.
                    </p>
                  </div>
                  {data.jobs.some((j) => j.state === 'complete' || j.state === 'failed') && (
                    <button
                      className="archive-finished-btn"
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          'archive-jobs',
                          () => api.archiveFinishedJobs(),
                          'Завершённые задания архивированы.',
                        )
                      }
                      title="Удалить завершённые и ошибочные задания из списка"
                    >
                      <Archive size={15} />
                      Архивировать завершённые (
                      {
                        data.jobs.filter((j) => j.state === 'complete' || j.state === 'failed')
                          .length
                      }
                      )
                    </button>
                  )}
                </div>
                {data.jobs.length === 0 ? (
                  <div className="simple-empty">
                    <History size={32} />
                    <h2>Заданий пока нет</h2>
                    <p>Запусти поиск выбранных записей или проверь план переноса в коллекции.</p>
                    <button onClick={() => setView('library')}>
                      К коллекции
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  data.jobs.map((job) => (
                    <section className="job" key={job.id}>
                      <div className="job-heading">
                        <div>
                          <h2>
                            {job.kind === 'search'
                              ? 'Поиск кандидатов Spotify'
                              : 'Перенос каталожных записей'}
                          </h2>
                          <span>
                            {data.collections.find((c) => c.id === job.collectionId)?.name} ·{' '}
                            {new Date(job.createdAt).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <span
                          className={`status-tag ${job.state === 'complete' ? 'spotify' : 'unresolved'}`}
                        >
                          {job.retryAt && job.retryAt > jobNow && job.state === 'paused'
                            ? 'Ожидание Spotify'
                            : {
                                running: 'Выполняется',
                                pausing: 'Останавливается',
                                paused: 'Пауза',
                                complete: 'Завершено',
                                failed: 'Ошибка',
                                'needs-review': 'Нужна сверка',
                              }[job.state]}
                        </span>
                      </div>
                      <progress
                        max={job.total || 1}
                        value={job.cursor}
                        aria-label="Прогресс задания"
                      />
                      <p aria-live="off">
                        {jobMessage(job, jobNow, data.settings.autoResumeSearch)}
                      </p>
                      {job.kind === 'search' && job.backgroundSearch && (
                        <label className="search-mode job-search-mode">
                          <input
                            type="checkbox"
                            checked={data.settings.autoResumeSearch}
                            disabled={!!busy}
                            onChange={(event) => setAutoResume(event.target.checked)}
                          />
                          Автопродолжение поиска
                        </label>
                      )}
                      {job.state === 'needs-review' && (
                        <PlaylistRecovery
                          busy={!!busy}
                          recover={(playlistId) =>
                            void run(
                              'recover',
                              () => api.recoverPlaylist(job.id, playlistId),
                              'Плейлист сверён. Теперь можно продолжить.',
                            )
                          }
                        />
                      )}
                      <div className="job-actions">
                        <span>
                          {count(job.cursor)} / {count(job.total)}
                        </span>
                        {job.state === 'paused' &&
                          job.kind === 'search' &&
                          job.searchProvider !== 'browser' && (
                            <button disabled={!!busy} onClick={() => continueSearch(job.id, true)}>
                              Продолжить через страницу Spotify
                            </button>
                          )}
                        {job.state === 'paused' && job.searchProvider === 'browser' && (
                          <button onClick={() => openSpotifyPanel(job.id)}>
                            Открыть Spotify здесь
                          </button>
                        )}
                        {job.state === 'paused' &&
                          autoSearch(job, data.settings.autoResumeSearch) && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                void run('pause', () => api.controlJob(job.id, 'pause'))
                              }
                            >
                              Оставить на паузе
                            </button>
                          )}
                        {job.playlistId && (
                          <button
                            onClick={() =>
                              void run('link', () =>
                                api.openExternal(
                                  `https://open.spotify.com/playlist/${job.playlistId}`,
                                ),
                              )
                            }
                          >
                            Открыть плейлист
                            <ArrowRight size={15} />
                          </button>
                        )}
                        {job.kind === 'transfer' &&
                          job.state === 'complete' &&
                          job.plan?.some((item) => item.destination === 'local') && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                void run(
                                  'mixed',
                                  () => api.reconcileMixed(job.id),
                                  'Смешанный порядок сверён.',
                                )
                              }
                            >
                              <CheckCheck size={16} />
                              Сверить смешанный порядок
                            </button>
                          )}
                        {job.state === 'running' ? (
                          <button
                            onClick={() => void run('pause', () => api.controlJob(job.id, 'pause'))}
                          >
                            <Pause size={16} />
                            Пауза
                          </button>
                        ) : job.state === 'paused' || job.state === 'failed' ? (
                          <ExplainedButton
                            hintLabel="Почему продолжение задания недоступно"
                            reason={resumeDisabledReason(
                              job,
                              data.jobs,
                              jobNow,
                              !!busy,
                              job.searchProvider === 'browser' || data.spotify.connected,
                              data.settings.autoResumeSearch,
                            )}
                            onClick={() =>
                              void run('resume', () => api.controlJob(job.id, 'resume'))
                            }
                          >
                            <Play size={16} />
                            Продолжить
                          </ExplainedButton>
                        ) : null}
                        {(job.state === 'complete' || job.state === 'failed') && (
                          <button
                            className="archive-job-btn"
                            disabled={!!busy}
                            onClick={() => void run('archive-job', () => api.archiveJob(job.id))}
                            title="Архивировать это задание"
                          >
                            <Archive size={14} />
                            Архивировать
                          </button>
                        )}
                      </div>
                    </section>
                  ))
                )}
              </div>
            )}
            {view === 'archive' && (
              <div className="content-page">
                <h1>Архив и экспорт</h1>
                <p className="page-description">
                  Полный архив хранит исходный список и рабочие правки. Исключённые записи остаются
                  в нём.
                </p>
                {collection ? (
                  <>
                    <div className="archive-context">
                      <Database size={22} />
                      <div>
                        <strong>{collection.name}</strong>
                        <span>
                          {count(collection.rows.length)} записей ·{' '}
                          {new Date(collection.importedAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    </div>
                    <div className="export-list">
                      {(
                        [
                          {
                            f: 'archive',
                            name: 'Полный архив VKSpot',
                            text: 'JSON: исходные записи, правки, исключения и выбранные назначения. Можно восстановить в VKSpot.',
                            icon: FileJson,
                          },
                          {
                            f: 'raw-json',
                            name: 'Буквальный исходный список',
                            text: 'JSON: позиции, повторы, исходные названия и доступность без рабочих исправлений.',
                            icon: ShieldCheck,
                          },
                          {
                            f: 'csv',
                            name: 'Таблица коллекции',
                            text: 'CSV: исходные и исправленные поля рядом, включая исключённые записи.',
                            icon: ListFilter,
                          },
                          {
                            f: 'plan',
                            name: 'План смешанного переноса',
                            text: 'JSON: только включённые записи с выбранным назначением в исходной последовательности.',
                            icon: ArrowRight,
                          },
                          {
                            f: 'm3u8',
                            name: 'Список M3U8',
                            text: 'Ссылки на локальные файлы и Spotify URI. Это план, а не загрузка аудио в Spotify.',
                            icon: FileAudio,
                          },
                        ] as const
                      ).map((item) => (
                        <div className="export-option" key={item.f}>
                          <item.icon size={23} />
                          <div>
                            <h2>{item.name}</h2>
                            <p>{item.text}</p>
                          </div>
                          <button disabled={!!busy} onClick={() => exported(item.f)}>
                            <ArrowDownToLine size={16} />
                            Сохранить
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="helper-text">
                      Архив содержит пути к файлам, но сами аудиофайлы в JSON не входят. Храни
                      отдельную резервную копию аудио.
                    </p>
                  </>
                ) : (
                  <div className="simple-empty">
                    <Database size={32} />
                    <h2>Сначала импортируй коллекцию</h2>
                    <button onClick={() => void importFile()}>Выбрать файл</button>
                  </div>
                )}
              </div>
            )}
            {view === 'settings' && (
              <div className="content-page">
                <h1>Настройки</h1>
                <p className="page-description">
                  Все настройки и данные остаются на этом компьютере.
                </p>
                <Preferences
                  settings={data.settings}
                  busy={!!busy}
                  save={(value) =>
                    void run('settings', () => api.saveSettings(value), 'Настройки сохранены.')
                  }
                />
                <section className="settings-section">
                  <h2>Данные</h2>
                  <p>Локальная база и защищённая сессия Spotify:</p>
                  <code className="data-path">{data.dataPath}</code>
                  <p className="helper-text">
                    Исходные записи защищены от изменения. Удаление и очистка коллекции в этой
                    версии не выполняются автоматически.
                  </p>
                </section>
              </div>
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
      <Dialog.Root
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Сохранить исходный список</Dialog.Title>
            <Dialog.Description>
              Создадим отдельную коллекцию. Названия и повторы останутся как в источнике.
            </Dialog.Description>
            {preview && (
              <>
                <label className="field">
                  Название коллекции
                  <input
                    value={preview.name}
                    onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                  />
                </label>
                <div className="import-summary">
                  <strong>{count(preview.tracks.length)}</strong>
                  <span>записей из {preview.origin}</span>
                </div>
                <p className="inline-warning">{preview.completeness.message}</p>
                <p className="helper-text">
                  {previewRows.length > 6 ? 'Первые три и последние три записи:' : 'Записи списка:'}
                </p>
                <div className="preview-tracks">
                  {previewSample.map(({ track, position }) => (
                    <div key={position}>
                      <span>{position}</span>
                      <strong>{track.artist || 'Без исполнителя'}</strong>
                      <span>{track.title || 'Без названия'}</span>
                    </div>
                  ))}
                </div>
                {reviewVK && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={acceptUnverified}
                      onChange={(event) => setAcceptUnverified(event.target.checked)}
                    />
                    Сохранить как непроверенный список. Он может содержать пропуски.
                  </label>
                )}
                {!preview.restored && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={searchAfterImport}
                      onChange={(event) => setSearchAfterImport(event.target.checked)}
                    />
                    Начать поиск после сохранения
                  </label>
                )}
                <div className="dialog-actions">
                  <Dialog.Close asChild>
                    <button disabled={!!busy}>Отмена</button>
                  </Dialog.Close>
                  <button
                    className="primary"
                    disabled={
                      !!busy ||
                      !preview.tracks.length ||
                      !preview.name.trim() ||
                      (!!reviewVK && !acceptUnverified)
                    }
                    onClick={() =>
                      void run('save-import', () => api.importCollection(preview)).then(
                        async (id) => {
                          if (id) {
                            setCollectionId(id)
                            setRecentExportId(id)
                            setPreview(null)
                            setView('library')
                            if (searchAfterImport && !preview.restored) {
                              const state = await api.state()
                              if (
                                state.ok &&
                                !state.value.jobs.some(
                                  (job) => job.state === 'running' || job.state === 'pausing',
                                ) &&
                                (state.value.settings.searchProvider === 'browser' ||
                                  state.value.spotify.connected)
                              ) {
                                const rows =
                                  state.value.collections.find((item) => item.id === id)?.rows ?? []
                                const pending = rows
                                  .filter((row) => reviewGroup(row) === 'pending')
                                  .map((row) => row.id)
                                if (pending.length)
                                  await run('search', () => api.startSearch(id, pending, true))
                              }
                            }
                          }
                        },
                      )
                    }
                  >
                    <ShieldCheck size={16} />
                    {reviewVK
                      ? 'Сохранить непроверенный список'
                      : `Сохранить ${count(preview.tracks.length)} записей`}
                  </button>
                </div>
              </>
            )}
            <Dialog.Close className="dialog-close" aria-label="Закрыть" disabled={!!busy}>
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={confirmTransfer} onOpenChange={setConfirmTransfer}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Проверка перед переносом</Dialog.Title>
            <Dialog.Description>
              Создадим новый приватный плейлист Spotify. Повторы сохраняются, исключённые записи не
              добавляются.
            </Dialog.Description>
            <div className="transfer-counts">
              <span>
                Spotify <strong>{count(counts.spotify)}</strong>
              </span>
              <span>
                Локальные <strong>{count(counts.local)}</strong>
              </span>
              <span>
                Не готово <strong>{count(counts.unresolved + counts['local-pending'])}</strong>
              </span>
            </div>
            {counts.unresolved + counts['local-pending'] > 0 && (
              <p className="inline-warning">
                Для каждой включённой записи нужно выбрать точное совпадение или локальный файл.
              </p>
            )}
            {counts.local > 0 && (
              <p className="helper-text">
                Сначала перенесём каталожные записи. Локальные добавляются через приложение Spotify;
                их позиции сохранятся в плане. Полный смешанный перенос ещё потребует сверки.
              </p>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button>Вернуться</button>
              </Dialog.Close>
              <button
                className="primary"
                disabled={
                  counts.unresolved + counts['local-pending'] > 0 || !counts.spotify || !!busy
                }
                onClick={() =>
                  void run('transfer', () => api.startTransfer(collectionId)).then((id) => {
                    if (id) {
                      setConfirmTransfer(false)
                      setView('jobs')
                    }
                  })
                }
              >
                Создать плейлист
                <ArrowRight size={16} />
              </button>
            </div>
            <Dialog.Close className="dialog-close" aria-label="Закрыть">
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
