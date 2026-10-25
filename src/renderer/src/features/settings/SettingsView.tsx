import type { Settings } from '../../../../shared/model'
import { Preferences } from './Preferences'

interface SettingsViewProps {
  settings: Settings
  dataPath: string
  busy: string
  onSaveSettings: (value: Settings) => void
}

export function SettingsView({ settings, dataPath, busy, onSaveSettings }: SettingsViewProps) {
  return (
    <div className="content-page settings-page">
      <h1>Настройки</h1>
      <p className="page-description">
        Поиск, сопоставление и оформление. Изменения применяются после сохранения.
      </p>
      <Preferences settings={settings} dataPath={dataPath} busy={!!busy} save={onSaveSettings} />
    </div>
  )
}

export default SettingsView
