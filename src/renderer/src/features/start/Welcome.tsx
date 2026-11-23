import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  FileAudio,
  Files,
  FolderOpen,
  ListChecks,
  PencilLine,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { ProjectIcon, SpotifyIcon, VKIcon } from '../../components/brand/BrandIcons'
import { guideCapture } from './GuideAssets'
import { GuideCaptureStage } from './GuideCaptureStage'
import { GuideLightbox } from './GuideLightbox'
import { GUIDE_SCENE_ACTIONS, GUIDE_STEPS, type GuideDestination } from './guide-steps'

type Props = {
  hasCollection: boolean
  busy: boolean
  theme: 'light' | 'dark'
  navigate: (view: GuideDestination) => void
  importFile: () => void
}

export default function Welcome({ hasCollection, busy, theme, navigate, importFile }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [markIndex, setMarkIndex] = useState(0)
  const [zoom, setZoom] = useState(false)
  const panel = useRef<HTMLElement>(null)

  const step = GUIDE_STEPS[stepIndex]
  const scene = step.scenes[sceneIndex]
  const capture = guideCapture(scene.key, theme)
  const target = GUIDE_SCENE_ACTIONS[scene.key] ?? step

  const selectStep = (index: number, scroll = false) => {
    setStepIndex(index)
    setSceneIndex(0)
    setMarkIndex(0)
    if (scroll) {
      requestAnimationFrame(() =>
        panel.current?.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        }),
      )
    }
  }

  return (
    <div className="content-page welcome-page welcome-detailed">
      <section className="welcome-intro" aria-labelledby="welcome-heading">
        <div className="welcome-identity">
          <ProjectIcon size={76} />
          <div>
            <h1 id="welcome-heading">Добро пожаловать в VKSpot</h1>
            <p className="welcome-lead">
              Сохрани коллекцию. Выбери версии. Перенеси в своём порядке.
            </p>
          </div>
        </div>
        <p className="welcome-annotation">
          VKSpot помогает перенести музыку из VK в Spotify без потери исходного списка. Оригинал
          остаётся в резервной копии, правки ведутся отдельно, а для каждого трека выбирается
          каталог Spotify или локальный файл.
        </p>
        <div className="welcome-facts">
          <span>
            <ShieldCheck size={18} aria-hidden="true" />
            Повторы и оригинал сохраняются
          </span>
          <span>
            <FolderOpen size={18} aria-hidden="true" />
            Обработка и хранение на твоём ПК
          </span>
        </div>
        <div className="button-row welcome-actions">
          <button
            type="button"
            className="primary"
            onClick={() => navigate(hasCollection ? 'library' : 'connections')}
          >
            {hasCollection ? 'Продолжить с коллекцией' : 'Начать с VK'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" disabled={busy} onClick={importFile}>
            <Upload size={16} aria-hidden="true" />У меня уже есть список
          </button>
          <a href="#welcome-roadmap">Посмотреть все шаги</a>
        </div>
      </section>

      <section className="welcome-explainer" aria-labelledby="welcome-flow-heading">
        <div className="welcome-section-heading">
          <h2 id="welcome-flow-heading">Как это работает</h2>
          <p>
            Нажми на этап, чтобы увидеть настоящий экран и узнать, где находятся нужные действия.
          </p>
        </div>
        <div className="workflow-track" aria-label="Путь коллекции">
          <button type="button" className="workflow-node" onClick={() => selectStep(0, true)}>
            <VKIcon size={34} />
            <strong>Список из VK</strong>
            <span>Все исходные записи</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button type="button" className="workflow-node" onClick={() => selectStep(1, true)}>
            <Files size={30} aria-hidden="true" />
            <strong>Резервная копия</strong>
            <span>Названия и повторы</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button type="button" className="workflow-node" onClick={() => selectStep(2, true)}>
            <PencilLine size={30} aria-hidden="true" />
            <strong>Рабочая копия</strong>
            <span>Правки и выбор</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <div className="workflow-branches">
            <button
              type="button"
              className="workflow-node spotify-node"
              onClick={() => selectStep(3, true)}
            >
              <SpotifyIcon size={32} />
              <div>
                <strong>Каталог Spotify</strong>
                <span>Без скачивания</span>
              </div>
            </button>
            <button type="button" className="workflow-node" onClick={() => selectStep(4, true)}>
              <FileAudio size={28} aria-hidden="true" />
              <div>
                <strong>Локальный файл</strong>
                <span>Нужный аудиофайл</span>
              </div>
            </button>
          </div>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button type="button" className="workflow-node" onClick={() => selectStep(5, true)}>
            <Check size={30} aria-hidden="true" />
            <strong>Твой плейлист</strong>
            <span>Проверка по плану</span>
          </button>
        </div>
        <p className="workflow-footnote">
          <ShieldCheck size={16} aria-hidden="true" />
          Исходный список сохраняется на всех этапах. Исключение записи не удаляет её из архива.
        </p>
      </section>

      <section
        className="welcome-roadmap"
        id="welcome-roadmap"
        aria-labelledby="welcome-roadmap-heading"
        ref={panel}
      >
        <div className="welcome-section-heading">
          <h2 id="welcome-roadmap-heading">Твой маршрут — прямо по интерфейсу</h2>
          <p>
            Это снимки реального VKSpot с демонстрационной коллекцией. Маркеры показывают точное
            положение элементов; нажми на номер для пояснения или листай их стрелками клавиатуры.
          </p>
        </div>
        <ol className="welcome-steps route-tabs" aria-label="Шаги инструкции">
          {GUIDE_STEPS.map((item, index) => (
            <li key={item.short}>
              <button
                type="button"
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => selectStep(index)}
              >
                <span>{index + 1}</span>
                {item.short}
              </button>
            </li>
          ))}
        </ol>
        <article className="guide-step" aria-label={'Шаг ' + (stepIndex + 1)}>
          <div className="guide-step-heading">
            <div>
              <h3>{step.title}</h3>
              <div className="guide-location">Где: {step.location}</div>
              <p>{step.description}</p>
            </div>
            <button type="button" onClick={() => navigate(target.destination)}>
              {target.action}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="guide-detail">{step.detail}</p>
          <div className="guide-meta-strip">
            <div className="guide-meta-card">
              <span>
                <ListChecks size={15} aria-hidden="true" />
                Что понадобится
              </span>
              <p>{step.prerequisites}</p>
            </div>
            <div className="guide-meta-card">
              <span>
                <CheckCircle2 size={15} aria-hidden="true" />
                Как понять, что шаг готов
              </span>
              <p>{step.outcome}</p>
            </div>
          </div>
          {step.scenes.length > 1 && (
            <div className="guide-scenes" aria-label="Экраны этого шага">
              {step.scenes.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={sceneIndex === index}
                  onClick={() => {
                    setSceneIndex(index)
                    setMarkIndex(0)
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <GuideCaptureStage
            scene={scene}
            capture={capture}
            theme={theme}
            markIndex={markIndex}
            onSelectMark={setMarkIndex}
            onOpenZoom={() => setZoom(true)}
          />
          <section className="guide-troubleshooting" aria-label="Если что-то пошло не так">
            <h4>
              <CircleHelp size={15} aria-hidden="true" />
              Если что-то пошло не так
            </h4>
            <div className="guide-faq-list">
              {step.troubleshooting.map((item) => (
                <details className="guide-faq-item" key={step.short + '-' + item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
          <div className="guide-pagination">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => selectStep(stepIndex - 1)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Предыдущий шаг
            </button>
            <span>
              {stepIndex + 1} из {GUIDE_STEPS.length}
            </span>
            <button
              type="button"
              className="primary"
              disabled={stepIndex === GUIDE_STEPS.length - 1}
              onClick={() => selectStep(stepIndex + 1)}
            >
              Следующий шаг
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>

      <section className="welcome-status" aria-labelledby="welcome-status-heading">
        <h2 id="welcome-status-heading">Что важно сейчас</h2>
        <div>
          <p>
            <strong>Локальные функции бесплатны.</strong> Подключение через Spotify API требует
            Premium у владельца API-приложения. Сам VKSpot не требует подписки или сервера.
          </p>
          <p>
            <strong>Локальные файлы добавляются вручную.</strong> VKSpot не скачивает аудио из VK —
            к редкой или заблокированной записи привязывается файл с твоего компьютера, а
            подготовленные копии подключаются через Local Files настольного Spotify.
          </p>
          <p>
            <strong>Выбор версий — за тобой.</strong> Совпадение названия не гарантирует ту же
            запись. Сохраняй cover, mashup, remix и авторские обозначения.
          </p>
        </div>
      </section>

      <GuideLightbox open={zoom} onOpenChange={setZoom} sceneName={scene.name} capture={capture} />
    </div>
  )
}
