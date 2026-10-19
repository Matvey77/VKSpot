import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileAudio,
  Files,
  FolderOpen,
  PencilLine,
  ShieldCheck,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react'
import { ProjectIcon, SpotifyIcon, VKIcon } from './BrandIcons'
import { guideCapture } from './GuideAssets'

type Destination = 'library' | 'connections' | 'jobs' | 'archive'
type Props = {
  hasCollection: boolean
  busy: boolean
  theme: 'light' | 'dark'
  navigate: (view: Destination, mode?: 'review' | 'table') => void
  importFile: () => void
}
type Scene = { key: string; name: string; instructions: string[] }
const steps: {
  short: string
  title: string
  location: string
  description: string
  detail: string
  action: string
  destination: Destination
  mode?: 'review' | 'table'
  scenes: Scene[]
}[] = [
  {
    short: 'Список',
    title: 'Получи полный исходный список',
    location: 'Подключения → VK Музыка',
    description:
      'Начни с того, что уже хранится в VK. Войди в отдельном окне, открой «Моя музыка» и вернись в VKSpot для выгрузки.',
    detail:
      'Если список уже есть, импортируй JSON, CSV или TXT. Недоступные записи и повторы сохраняются. После выгрузки проверь количество и крайние записи.',
    action: 'Открыть подключения',
    destination: 'connections',
    scenes: [
      {
        key: 'source',
        name: 'Выгрузка из VK',
        instructions: [
          'Выбери «Подключения» в левой панели. Здесь находятся подключения к обоим сервисам.',
          'Нажми «Открыть VK». В отдельном окне самостоятельно войди и открой «Моя музыка».',
          'Вернись в VKSpot и нажми «Выгрузить мой список». Перед сохранением проверь его полноту.',
        ],
      },
    ],
  },
  {
    short: 'Архив',
    title: 'Сохрани исходник до любых правок',
    location: 'Архив и экспорт',
    description:
      'У тебя останется полная копия описаний: исходные названия, повторы, недоступные записи и все рабочие изменения.',
    detail: 'Аудиофайлы в JSON не входят. Их резервную копию нужно хранить отдельно.',
    action: 'Открыть архив и экспорт',
    destination: 'archive',
    scenes: [
      {
        key: 'archive',
        name: 'Две резервные копии',
        instructions: [
          'Открой «Архив и экспорт» после импорта коллекции.',
          'Сохрани «Полный архив VKSpot». Его можно восстановить вместе с рабочими правками.',
          'Отдельно сохрани «Буквальный исходный список». В нём названия останутся как в VK.',
        ],
      },
    ],
  },
  {
    short: 'Правки',
    title: 'Приведи рабочую копию в порядок',
    location: 'Коллекция → Таблица → выбери запись → панель справа',
    description:
      'Оригинал виден отдельно. Правь название, исполнителя и версию в рабочей копии, а ненужные записи отмечай «исключить».',
    detail:
      'Сохраняй cover, mashup, remix и авторские теги. Неясную запись можно оставить без решения. Изменения можно отменить.',
    action: 'Открыть коллекцию',
    destination: 'library',
    mode: 'table',
    scenes: [
      {
        key: 'edit-original',
        name: 'Где оригинал',
        instructions: [
          'Открой «Коллекция», выбери вкладку «Таблица» и нажми нужную строку. Справа появится панель записи.',
          'Раздел «Оригинал из VK» показывает исходные данные. Поля здесь не редактируются.',
        ],
      },
      {
        key: 'edit',
        name: 'Где править',
        instructions: [
          'Во вкладке «Таблица» выбери запись, которую хочешь исправить.',
          'Прокрути панель справа до «Рабочая копия». Редактируй поля только в этой части.',
          'Нажми «Сохранить правки». Только сохранённые значения попадают в архив.',
          '«Исключить из переноса» оставляет запись в списке и архиве, но убирает её из плана.',
        ],
      },
    ],
  },
  {
    short: 'Spotify',
    title: 'Найди именно нужную версию',
    location: 'Коллекция → Таблица',
    description:
      'Поиск через страницу Spotify включён по умолчанию. В таблице виден статус каждой записи; совпадения можно подтвердить группой, а спорную версию открыть для сравнения.',
    detail:
      'Для поиска Client ID не нужен. Подключение API требуется позже, для создания плейлиста. Выбор версии всегда остаётся за тобой.',
    action: 'Настроить Spotify',
    destination: 'connections',
    scenes: [
      {
        key: 'spotify-connect',
        name: 'API для переноса',
        instructions: [
          'Для переноса открой «Подключения» → «Spotify API — подключение для переноса». Вставь Client ID и сохрани настройки. Для поиска через страницу это не требуется; прокси можно задать отдельно.',
          'Добавь этот точный Redirect URI в настройках Spotify-приложения.',
          'После сохранения Client ID нажми «Войти в Spotify» и подтверди доступ в браузере.',
        ],
      },
      {
        key: 'spotify-search',
        name: 'Фоновый поиск',
        instructions: [
          'В таблице нажми «Фоновый поиск». Автопродолжение включено по умолчанию: после ожидания Spotify запросы продолжатся сами, пока приложение открыто. Ручная пауза останавливает поиск до команды «Продолжить».',
          'Фильтруй записи по результату поиска и назначению, добавляй текстовый поиск. «Без результатов» означает только, что текущий запрос ничего не нашёл; это не доказательство отсутствия песни в Spotify.',
          '«Выделить совпадения» выберет все записи «Совпадают данные» в текущей выборке, включая строки за пределами видимой части таблицы.',
        ],
      },
      {
        key: 'spotify-bulk',
        name: 'Совпадают данные',
        instructions: [
          'Выбери результат «Совпадают данные» и выдели выборку либо нажми «Выделить совпадения». Здесь единственный кандидат с теми же названием и исполнителями и разницей длительности до двух секунд. Особые версии проверяются отдельно.',
          'Нажми «Подтвердить выбранные», если принимаешь эти варианты. Это решение в коллекции, без записи в плейлист Spotify; сходство описаний не доказывает идентичность аудио. Изменение применяется только к выделенным записям.',
          '«Отменить последнюю правку» отменяет всю подтверждённую группу одной операцией.',
        ],
      },
      {
        key: 'spotify-match',
        name: 'Выбор записи',
        instructions: [
          'Нажми стрелку «Сравнить версии» у нужной строки таблицы либо открой «Разбор коллекции» → «Проверить версии». Оригинал VK и кандидаты показаны рядом. Сравни описание и длительность; при сомнениях послушай в Spotify.',
          'Нажми «Выбрать и дальше» у нужной версии. Решение сохранится, затем откроется следующая запись этой группы.',
          'Если нужен файл, нажми «Нужен локальный файл». Запись останется неготовой до привязки настоящего файла. Её также можно отложить или исключить без удаления из архива.',
        ],
      },
    ],
  },
  {
    short: 'Файлы',
    title: 'Сохрани записи вне каталога Spotify',
    location: 'Коллекция → Нужен файл или Таблица, затем Подключения',
    description:
      'Для редкой версии нужен сам аудиофайл. Привяжи его к записи, подготовь копии и добавь их через приложение Spotify.',
    detail:
      'Копии создаются без перекодирования. Скачивание аудио из VK и массовое добавление через интерфейс пока не реализованы.',
    action: 'Открыть подготовку файлов',
    destination: 'connections',
    scenes: [
      {
        key: 'local-link',
        name: 'Привязка файла',
        instructions: [
          'В разборе нажми «Привязать файл» в группе «Нужен файл» либо открой запись во вкладке «Таблица», как на снимке. Укажи настоящий аудиофайл на диске; получение отсутствующих файлов из VK пока не реализовано.',
          'Проверь текущее назначение. Оно должно быть «локальный файл», если хочешь использовать эту копию.',
        ],
      },
      {
        key: 'local-prepare',
        name: 'Подготовка копий',
        instructions: [
          'Нажми «Подготовить файлы» и выбери папку. VKSpot сохранит копии и план порядка.',
          'Открой приложение Spotify, подключи подготовленную папку в локальных файлах и добавь записи в плейлист.',
        ],
      },
    ],
  },
  {
    short: 'Перенос',
    title: 'Собери плейлист и проверь порядок',
    location: 'Коллекция → Проверить перенос, затем Задания',
    description:
      'Каждой включённой записи нужно назначение. Сначала добавляются каталожные треки; локальные файлы добавляются через Spotify отдельно.',
    detail:
      'Пауза не удаляет прогресс. Сверка смешанного порядка запускается после добавления локальных записей и требует корректных тегов файлов.',
    action: 'Открыть коллекцию для переноса',
    destination: 'library',
    scenes: [
      {
        key: 'transfer-plan',
        name: 'Проверка плана',
        instructions: [
          'Нажми «Проверить перенос». Кнопка станет доступна после подключения Spotify. До запуска разберись со всеми включёнными записями.',
        ],
      },
      {
        key: 'transfer',
        name: 'Сверка результата',
        instructions: [
          'Открой «Задания»: здесь прогресс и продолжение после остановки.',
          'Когда локальные записи уже добавлены в созданный плейлист, нажми «Сверить смешанный порядок». Состав и последовательность будут проверены по плану.',
        ],
      },
    ],
  },
]

export default function Welcome({ hasCollection, busy, theme, navigate, importFile }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [markIndex, setMarkIndex] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [bubble, setBubble] = useState<{ index: number; left: number; top: number } | null>(null)
  useEffect(() => {
    const close = () => setBubble(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    // Native focus may finish scrolling after click. Only user scrolling closes help.
    document.addEventListener('wheel', close, { passive: true })
    document.addEventListener('touchmove', close, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('wheel', close)
      document.removeEventListener('touchmove', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [])
  const panel = useRef<HTMLElement>(null)
  const step = steps[stepIndex],
    scene = step.scenes[sceneIndex],
    capture = guideCapture(scene.key, theme)
  const sceneAction: Partial<
    Record<string, { destination: Destination; action: string; mode?: 'review' | 'table' }>
  > = {
    'spotify-search': { destination: 'library', action: 'Открыть фоновый поиск', mode: 'table' },
    'spotify-bulk': { destination: 'library', action: 'Открыть разбор совпадений', mode: 'table' },
    'spotify-match': { destination: 'library', action: 'Открыть сравнение версий', mode: 'review' },
    'local-link': { destination: 'library', action: 'Открыть коллекцию для файла', mode: 'table' },
    transfer: { destination: 'jobs', action: 'Открыть задания' },
  }
  const target = sceneAction[scene.key] ?? step
  const selectStep = (index: number, scroll = false) => {
    setStepIndex(index)
    setSceneIndex(0)
    setMarkIndex(0)
    setBubble(null)
    if (scroll)
      requestAnimationFrame(() =>
        panel.current?.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        }),
      )
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
          VKSpot помогает подготовить музыку из VK к переносу в Spotify. Полный исходник остаётся в
          архиве, правки ведутся отдельно, а для каждого трека выбирается каталог Spotify или
          локальный файл.
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
            className="primary"
            onClick={() => navigate(hasCollection ? 'library' : 'connections')}
          >
            {hasCollection ? 'Продолжить с коллекцией' : 'Начать с VK'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button disabled={busy} onClick={importFile}>
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
          <button className="workflow-node" onClick={() => selectStep(0, true)}>
            <VKIcon size={34} />
            <strong>Список из VK</strong>
            <span>Все исходные записи</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button className="workflow-node" onClick={() => selectStep(1, true)}>
            <Files size={30} aria-hidden="true" />
            <strong>Полный архив</strong>
            <span>Названия и повторы</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button className="workflow-node" onClick={() => selectStep(2, true)}>
            <PencilLine size={30} aria-hidden="true" />
            <strong>Рабочая копия</strong>
            <span>Правки и выбор</span>
          </button>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <div className="workflow-branches">
            <button className="workflow-node spotify-node" onClick={() => selectStep(3, true)}>
              <SpotifyIcon size={32} />
              <div>
                <strong>Каталог Spotify</strong>
                <span>Без скачивания</span>
              </div>
            </button>
            <button className="workflow-node" onClick={() => selectStep(4, true)}>
              <FileAudio size={28} aria-hidden="true" />
              <div>
                <strong>Локальный файл</strong>
                <span>Нужный аудиофайл</span>
              </div>
            </button>
          </div>
          <ArrowRight className="workflow-arrow" size={22} aria-hidden="true" />
          <button className="workflow-node" onClick={() => selectStep(5, true)}>
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
            положение элементов; нажми на номер для пояснения.
          </p>
        </div>
        <ol className="welcome-steps route-tabs" aria-label="Шаги инструкции">
          {steps.map((item, index) => (
            <li key={item.short}>
              <button
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
            <button onClick={() => navigate(target.destination, target.mode)}>
              {target.action}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="guide-detail">{step.detail}</p>
          {step.scenes.length > 1 && (
            <div className="guide-scenes" aria-label="Экраны этого шага">
              {step.scenes.map((item, index) => (
                <button
                  key={item.key}
                  aria-pressed={sceneIndex === index}
                  onClick={() => {
                    setSceneIndex(index)
                    setMarkIndex(0)
                    setBubble(null)
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
          <figure className="guide-capture">
            <div
              className="guide-canvas"
              style={{ aspectRatio: capture.width + '/' + capture.height }}
            >
              <img
                src={capture.src}
                width={capture.width}
                height={capture.height}
                alt={'Настоящий экран VKSpot: ' + scene.name + '. Демонстрационные данные.'}
              />
              {capture.marks.map((mark, index) => (
                <div
                  className={'guide-highlight ' + (markIndex === index ? 'selected' : '')}
                  key={mark.label}
                  style={{
                    left: mark.x + '%',
                    top: mark.y + '%',
                    width: mark.width + '%',
                    height: mark.height + '%',
                  }}
                >
                  <button
                    className="guide-marker"
                    aria-label={'Пояснение ' + (index + 1) + ': ' + mark.label}
                    aria-pressed={markIndex === index}
                    aria-expanded={bubble?.index === index}
                    onClick={(event) => {
                      setMarkIndex(index)
                      const box = event.currentTarget.getBoundingClientRect()
                      setBubble({
                        index,
                        left: Math.min(window.innerWidth - 330, Math.max(12, box.right + 12)),
                        top: Math.min(window.innerHeight - 230, Math.max(72, box.bottom + 10)),
                      })
                    }}
                  >
                    {index + 1}
                  </button>
                </div>
              ))}
            </div>
            <figcaption>
              <span>
                Реальный интерфейс · демонстрационные записи ·{' '}
                {theme === 'dark' ? 'тёмное' : 'светлое'} оформление
              </span>
              <button onClick={() => setZoom(true)}>
                <ZoomIn size={15} aria-hidden="true" />
                Открыть снимок крупнее
              </button>
            </figcaption>
          </figure>
          <ol className="guide-instructions">
            {scene.instructions.map((text, index) => (
              <li className={markIndex === index ? 'selected' : ''} key={text}>
                <button
                  aria-label={'Пояснение ' + (index + 1)}
                  aria-pressed={markIndex === index}
                  onClick={() => setMarkIndex(index)}
                >
                  {index + 1}
                </button>
                <p>
                  <strong>{capture.marks[index]?.label}</strong>
                  {text}
                </p>
              </li>
            ))}
          </ol>
          <div className="guide-pagination">
            <button disabled={stepIndex === 0} onClick={() => selectStep(stepIndex - 1)}>
              <ArrowLeft size={16} aria-hidden="true" />
              Предыдущий шаг
            </button>
            <span>
              {stepIndex + 1} из {steps.length}
            </span>
            <button
              className="primary"
              disabled={stepIndex === steps.length - 1}
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
            <strong>Живые подключения требуют проверки.</strong> Скачивание аудио из VK и массовое
            добавление локальных файлов пока не реализованы. Заблокированная запись может остаться
            только в списке.
          </p>
          <p>
            <strong>Выбор версий — вручную.</strong> Совпадение названия не подтверждает запись.
            Сохраняй cover, mashup, remix и авторские обозначения.
          </p>
        </div>
      </section>
      <Dialog.Root open={zoom} onOpenChange={setZoom}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog guide-lightbox">
            <Dialog.Title>{scene.name} — настоящий экран VKSpot</Dialog.Title>
            <Dialog.Description>
              Демонстрационная коллекция. Это изображение, а не подключение к аккаунту.
            </Dialog.Description>
            <img
              src={capture.src}
              width={capture.width}
              height={capture.height}
              alt={'Увеличенный снимок: ' + scene.name}
            />
            <Dialog.Close className="dialog-close" aria-label="Закрыть снимок">
              <X size={20} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {bubble &&
        createPortal(
          <aside
            className="guide-bubble"
            style={{ left: bubble.left, top: bubble.top }}
            role="status"
          >
            <button
              className="icon-button"
              aria-label="Закрыть пояснение"
              onClick={() => setBubble(null)}
            >
              <X size={16} />
            </button>
            <strong>
              {bubble.index + 1}. {capture.marks[bubble.index]?.label}
            </strong>
            <p>{scene.instructions[bubble.index]}</p>
          </aside>,
          document.body,
        )}
    </div>
  )
}
