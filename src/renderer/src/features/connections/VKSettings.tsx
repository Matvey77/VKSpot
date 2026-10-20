import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Settings } from '../../../../shared/model'

export function VKSettings({
  settings,
  busy,
  save,
}: {
  settings: Settings
  busy: boolean
  save: (s: Settings) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [testingVKProxy, setTestingVKProxy] = useState(false)
  const [vkProxyResult, setVkProxyResult] = useState<{
    ok: boolean
    latencyMs?: number
    error?: string
  } | null>(null)

  useEffect(() => setDraft(settings), [settings])

  const unsaved =
    draft.useProxyForVK !== settings.useProxyForVK || draft.vkProxy !== settings.vkProxy

  const handleTestVKProxy = async () => {
    setTestingVKProxy(true)
    setVkProxyResult(null)
    try {
      const res = await window.vkspot.testProxy(draft.vkProxy, 'vk')
      if (res.ok) {
        if (res.value.ok) {
          setVkProxyResult({ ok: true, latencyMs: res.value.latencyMs })
        } else {
          setVkProxyResult({ ok: false, error: res.value.error })
        }
      } else {
        setVkProxyResult({ ok: false, error: res.error })
      }
    } catch (e) {
      setVkProxyResult({ ok: false, error: e instanceof Error ? e.message : 'Ошибка проверки' })
    } finally {
      setTestingVKProxy(false)
    }
  }

  return (
    <div className="vk-proxy-block" style={{ marginTop: '20px' }}>
      <h3 style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 600 }}>
        Сетевое подключение к VK
      </h3>
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.useProxyForVK}
          onChange={(e) => setDraft({ ...draft, useProxyForVK: e.target.checked })}
        />
        Использовать прокси для VK
      </label>
      <p className="helper-text">
        По умолчанию выключено. Для стабильной работы VK и воспроизведения музыки рекомендуется
        прямое соединение без прокси.
      </p>
      {draft.useProxyForVK && (
        <div className="proxy-field-block" style={{ marginTop: '12px' }}>
          <div className="field">
            <label htmlFor="vk-proxy-input">Прокси VK (HTTP или SOCKS5)</label>
            <div className="proxy-input-group">
              <input
                id="vk-proxy-input"
                value={draft.vkProxy}
                placeholder="http://127.0.0.1:2080"
                onChange={(e) => {
                  setDraft({ ...draft, vkProxy: e.target.value.trim() })
                  setVkProxyResult(null)
                }}
              />
              <button
                type="button"
                className="proxy-test-button"
                disabled={busy || testingVKProxy}
                onClick={handleTestVKProxy}
                title="Проверить доступность серверов VK через этот прокси"
              >
                {testingVKProxy ? <Loader2 size={13} className="spin" /> : null}
                <span>{testingVKProxy ? 'Проверка…' : 'Проверить VK'}</span>
              </button>
            </div>
          </div>
          {vkProxyResult && (
            <div className={`proxy-result-hint ${vkProxyResult.ok ? 'success' : 'error'}`}>
              {vkProxyResult.ok
                ? `✓ Подключение к VK успешно (${vkProxyResult.latencyMs} мс)`
                : `✕ Ошибка подключения к VK: ${vkProxyResult.error}`}
            </div>
          )}
        </div>
      )}
      <div className="button-row" style={{ marginTop: '12px' }}>
        <button disabled={busy || !unsaved} onClick={() => save(draft)}>
          Сохранить настройки сети VK
        </button>
      </div>
    </div>
  )
}
