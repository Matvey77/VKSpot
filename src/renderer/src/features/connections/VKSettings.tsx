import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { humanizeError } from '../../../../shared/ru'
import type { Settings } from '../../../../shared/types'
import { useProxyTester, validateProxyUrl } from './useProxyTester'

export function VKSettings({
  settings,
  busy,
  save,
}: {
  settings: Settings
  busy: boolean
  save: (s: Settings) => void
}) {
  const [useProxyForVK, setUseProxyForVK] = useState(settings.useProxyForVK)
  const [vkProxy, setVkProxy] = useState(settings.vkProxy)
  const {
    testing: testingVKProxy,
    result: vkProxyResult,
    testProxy: testVKProxy,
    clearResult: clearVKProxyResult,
  } = useProxyTester('vk')

  useEffect(() => {
    setUseProxyForVK(settings.useProxyForVK)
    setVkProxy(settings.vkProxy)
  }, [settings.useProxyForVK, settings.vkProxy])

  const trimmedVkProxy = vkProxy.trim()
  const rawProxyError = validateProxyUrl(vkProxy)
  const vkProxyError = useProxyForVK ? rawProxyError : null
  const nextVkProxy = !useProxyForVK && rawProxyError ? settings.vkProxy : trimmedVkProxy
  const unsaved = useProxyForVK !== settings.useProxyForVK || nextVkProxy !== settings.vkProxy

  return (
    <div className="vk-proxy-block" style={{ marginTop: '20px' }}>
      <h3 style={{ fontSize: '15px', marginBottom: '8px', fontWeight: 600 }}>
        Сетевое подключение к VK
      </h3>
      <label className="check-field">
        <input
          type="checkbox"
          checked={useProxyForVK}
          onChange={(e) => setUseProxyForVK(e.target.checked)}
        />
        Использовать прокси для VK
      </label>
      <p className="helper-text">
        По умолчанию выключено. Для стабильной работы VK и воспроизведения музыки рекомендуется
        прямое соединение без прокси.
      </p>
      {useProxyForVK && (
        <div className="proxy-field-block" style={{ marginTop: '12px' }}>
          <div className="field">
            <label htmlFor="vk-proxy-input">Прокси VK (HTTP или SOCKS5)</label>
            <div className="proxy-input-group">
              <input
                id="vk-proxy-input"
                value={vkProxy}
                placeholder="http://127.0.0.1:2080"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(vkProxyError)}
                aria-describedby={vkProxyError ? 'vk-proxy-error' : undefined}
                onChange={(e) => {
                  setVkProxy(e.target.value)
                  clearVKProxyResult()
                }}
              />
              <button
                type="button"
                className="proxy-test-button"
                disabled={busy || testingVKProxy || Boolean(vkProxyError)}
                onClick={() => void testVKProxy(vkProxy)}
                title="Проверить доступность серверов VK через этот прокси"
              >
                {testingVKProxy ? (
                  <Loader2 size={13} className="spinning" aria-hidden="true" />
                ) : null}
                <span>{testingVKProxy ? 'Проверка…' : 'Проверить VK'}</span>
              </button>
            </div>
          </div>
          {vkProxyError && (
            <p id="vk-proxy-error" className="inline-warning" role="alert">
              {vkProxyError}
            </p>
          )}
          {vkProxyResult && (
            <div className={`proxy-result-hint ${vkProxyResult.ok ? 'success' : 'error'}`}>
              {vkProxyResult.ok ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  <span>Подключение к VK успешно ({vkProxyResult.latencyMs} мс)</span>
                </>
              ) : (
                <>
                  <X size={14} aria-hidden="true" />
                  <span>Ошибка подключения к VK: {humanizeError(vkProxyResult.error)}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div className="button-row" style={{ marginTop: '12px' }}>
        <button
          disabled={busy || !unsaved || Boolean(vkProxyError)}
          onClick={() => save({ ...settings, useProxyForVK, vkProxy: nextVkProxy })}
        >
          Сохранить настройки сети VK
        </button>
      </div>
    </div>
  )
}
