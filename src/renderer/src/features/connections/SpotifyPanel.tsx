import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Play, RotateCcw, ExternalLink, LoaderCircle } from 'lucide-react'
import type { AppState, Result } from '../../../../shared/model'

type BrowserPageState = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  message: string
}
type BrowserStateWithPage = NonNullable<AppState['spotifyBrowser']> & {
  page?: BrowserPageState
  reason?: 'verification' | 'load' | 'read'
}
type SpotifyBridgeWithReload = typeof window.vkspot & {
  reloadSpotifyBrowser?: (owner?: string) => Promise<Result<void>>
}

export default function SpotifyPanel({
  onClose,
  onResume,
  browserState,
}: {
  onClose: () => void
  onResume?: () => void
  browserState?: AppState['spotifyBrowser']
}) {
  const [areaNode, setAreaNode] = useState<HTMLDivElement | null>(null)
  const setArea = useCallback((node: HTMLDivElement | null) => setAreaNode(node), [])
  const owner = useRef<string | null>(null)
  if (!owner.current) owner.current = crypto.randomUUID()
  const [commandError, setCommandError] = useState('')
  const [reloading, setReloading] = useState(false)
  const status = browserState as BrowserStateWithPage | undefined
  useEffect(() => {
    if (!areaNode) return
    let alive = true
    let queue = Promise.resolve()
    const update = () => {
      const box = areaNode.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return
      const bounds = {
        x: Math.ceil(box.x),
        y: Math.ceil(box.y),
        width: Math.floor(box.width),
        height: Math.floor(box.height),
      }
      queue = queue
        .then(async () => {
          if (!alive) return
          const result = await window.vkspot.showSpotifyBrowser(bounds, owner.current!)
          if (!result.ok && alive) setCommandError(result.error)
        })
        .catch((reason: unknown) => {
          if (alive)
            setCommandError(
              reason instanceof Error ? reason.message : 'Не удалось открыть страницу Spotify.',
            )
        })
    }
    const observer = new ResizeObserver(update)
    observer.observe(areaNode)
    window.addEventListener('resize', update)
    update()
    return () => {
      alive = false
      observer.disconnect()
      window.removeEventListener('resize', update)
      void window.vkspot.showSpotifyBrowser(null, owner.current!)
    }
  }, [areaNode])
  const reload = async () => {
    setReloading(true)
    setCommandError('')
    try {
      const bridge = window.vkspot as SpotifyBridgeWithReload
      if (!bridge.reloadSpotifyBrowser) {
        setCommandError('Обновление страницы Spotify недоступно.')
        return
      }
      const result = await bridge.reloadSpotifyBrowser(owner.current!)
      if (!result.ok) setCommandError(result.error)
    } catch (reason) {
      setCommandError(
        reason instanceof Error ? reason.message : 'Не удалось обновить страницу Spotify.',
      )
    } finally {
      setReloading(false)
    }
  }
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'F5' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')
      ) {
        event.preventDefault()
        void reload()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  const leave = async (resume = false) => {
    await window.vkspot.showSpotifyBrowser(null, owner.current!)
    onClose()
    if (resume) onResume?.()
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void leave()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="spotify-panel" onEscapeKeyDown={() => void leave()}>
          <header>
            <div className="header-actions">
              <button onClick={() => void leave()}>
                <ArrowLeft size={16} />
                Вернуться к коллекции
              </button>
              <button
                className="secondary"
                disabled={reloading}
                onClick={() => void reload()}
                title="Обновить страницу Spotify (F5, Ctrl+R или ⌘R)"
              >
                <RotateCcw size={15} className={reloading ? 'spinning' : ''} />
                {reloading ? 'Обновляем…' : 'Обновить'}
              </button>
              <button
                className="secondary"
                onClick={() => void window.vkspot.openExternal('https://open.spotify.com/search')}
                title="Открыть Spotify в системном браузере"
              >
                <ExternalLink size={15} />В браузере
              </button>
            </div>
            <div>
              <Dialog.Title>Spotify внутри VKSpot</Dialog.Title>
              <Dialog.Description>
                {status?.reason === 'verification'
                  ? 'Заверши вход или проверку на странице Spotify.'
                  : status?.page?.state === 'loading'
                    ? 'Загружаем страницу Spotify…'
                    : 'Страница Spotify открыта внутри VKSpot.'}
              </Dialog.Description>
            </div>
            {onResume && (
              <button className="primary" onClick={() => void leave(true)}>
                <Play size={16} />
                Продолжить поиск
              </button>
            )}
          </header>
          {status?.page?.state === 'loading' && (
            <p className="helper-text" role="status">
              {status.page.message || 'Загружаем страницу Spotify…'}
            </p>
          )}
          {status?.page?.state === 'error' && (
            <div className="inline-warning" role="alert">
              <span>{status.page.message || 'Не удалось загрузить страницу Spotify.'}</span>
              <button className="secondary" disabled={reloading} onClick={() => void reload()}>
                {reloading ? 'Обновляем…' : 'Повторить попытку'}
              </button>
            </div>
          )}
          {commandError && (
            <p className="inline-warning" role="alert">
              {commandError}
            </p>
          )}
          <div className="spotify-native-area" ref={setArea} aria-label="Страница Spotify">
            {(!status?.page || status?.page?.state === 'loading') && (
              <div className="spotify-placeholder" role="status">
                <LoaderCircle className="spinning" size={24} />
                <span>{status?.page?.message || 'Загружаем страницу Spotify…'}</span>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
