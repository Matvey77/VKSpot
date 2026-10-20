import type { Settings } from '../../../../shared/model'
import { Preferences } from './Preferences'

export interface SettingsViewProps {
  settings: Settings
  dataPath: string
  busy: string
  onSaveSettings: (value: Settings) => void
}

export function SettingsView({ settings, dataPath, busy, onSaveSettings }: SettingsViewProps) {
  return (
    <div className="content-page">
      <h1>Настройки</h1>
      <p className="page-description">Все настройки и данные остаются на этом компьютере.</p>
      <Preferences settings={settings} busy={!!busy} save={onSaveSettings} />
      <section className="settings-section">
        <h2>Данные</h2>
        <p>Локальная база и защищённая сессия Spotify:</p>
        <code className="data-path">{dataPath}</code>
        <p className="helper-text">
          Исходные записи защищены от изменения. Удаление и очистка коллекции в этой версии не
          выполняются автоматически.
        </p>
      </section>
    </div>
  )
}

export default SettingsView
