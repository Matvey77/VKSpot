---
name: VKSpot
description: A local desktop music collection workspace with visible provenance.
colors:
  canvas: '#f4f6f5'
  surface: '#fff'
  shell: '#162d3b'
  ink: '#172e3a'
  muted: '#536570'
  line: '#d8e1e3'
  accent: '#087f73'
  accent-hover: '#06665e'
  selected: '#e6f3ef'
  control: '#fff'
  hover: '#f0f5f3'
  warning-bg: '#fff2d8'
  warning-ink: '#8b570c'
  error-bg: '#fff0f1'
  error-ink: '#a72d3a'
  local-bg: '#e8eff9'
  local-ink: '#315984'
  nav-text: '#bdcfd8'
  nav-hover: '#264655'
  nav-active: '#315467'
  dark-canvas: '#14232a'
  dark-surface: '#1c2e37'
  dark-ink: '#edf5f5'
  dark-muted: '#b0c2ca'
  dark-line: '#3a505a'
  dark-accent: '#54cbb2'
  dark-accent-hover: '#84dec9'
  dark-selected: '#244b45'
  dark-control: '#233842'
  dark-hover: '#293e46'
  dark-warning-bg: '#47381e'
  dark-warning-ink: '#ffdc99'
  dark-error-bg: '#472d35'
  dark-error-ink: '#ffb8c0'
  dark-local-bg: '#293e59'
  dark-local-ink: '#bad3fa'
  dark-primary-text: '#102b28'
typography:
  headline:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '14px'
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '12px'
  helper:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: '11px'
    lineHeight: 1.6
  code:
    fontFamily: 'Consolas, monospace'
    fontSize: '12px'
rounded:
  tag: '4px'
  control: '6px'
  navigation: '7px'
  panel: '10px'
  dialog: '12px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '36px'
  field:
    backgroundColor: '{colors.control}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '36px'
  navigation-active:
    backgroundColor: '{colors.nav-active}'
    textColor: '{colors.surface}'
    rounded: '{rounded.navigation}'
    padding: '0 12px'
    height: '42px'
  destination-spotify:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.tag}'
    padding: '4px 7px'
  collection-panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
  provenance-inspector:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    width: '340px'
  welcome-guide-step:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    padding: '24px 0 0'
  welcome-route-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.control}'
    padding: '0 14px'
    height: '42px'
---

# Дизайн-система VKSpot

## 1. Концепция: «Архивный формуляр» (The Library Finding Aid)

VKSpot спроектирован как строгое, высокоинформативное десктопное рабочее пространство. Характер интерфейса вдохновлен культурой каталогизации, архивного учета и проверяемых первоисточников: глубокий цвет морской волны в навигации, бумажно-светлые читаемые поверхности, моноширинные числовые индексы и сдержанные бирюзовые акценты.

Базовая сигнатура пользовательского опыта — триада **«Оригинал → Рабочая копия → Назначение»**:

1. **Оригинал из VK:** Неприкосновенные исходные поля и свидетельства извлечения.
2. **Рабочая копия:** Редактируемые поля, ручные корректировки и пользовательские теги.
3. **Назначение:** Явно зафиксированный целевой результат (Spotify, локальный файл или необходимость выбора).

---

## 2. Цветовая палитра и семантика токенов

### Основные цвета

- **Архивный бирюзовый (`accent`, `accent-hover`):** Интерактивные кнопки первого порядка, индикаторы фокуса клавиатуры, статус подтвержденного назначения Spotify.
- **Светло-бирюзовый отбор (`selected`):** Подсветка активной строки, выделенные карточки радио-групп и выбранные кандидаты.
- **Навигационный синий (`shell`, `nav-text`, `nav-hover`, `nav-active`):** Постоянный левый сайдбар, создающий ощущение надежного рабочего станка.

### Фоновые и читаемые поверхности

- **Бумажный холст (`canvas`, `surface`, `control`):** Светлые, свободные от бликов рабочие зоны таблицы, инспектора и форм ввода.
- **Чернильный темный (`ink`, `muted`):** Тексты заголовков, названий треков и метаданных высокой контрастности.
- **Тонкая разметка (`line`, `hover`):** Однопиксельные разделители строк и рамок панелей.

### Семантические статусы

- **Янтарный (`warning-bg`, `warning-ink`):** Непроверенное количество выгрузки или статус заблокированного трека в VK (блокировка не означает удаление из списка).
- **Розовый (`error-bg`, `error-ink`):** Сетевые сбои, ошибки валидации и отказы сервисов.
- **Индиго (`local-bg`, `local-ink`):** Маркеры привязанных и ожидающих локальных аудиофайлов.

### Темная тема

Интерфейс поддерживает переключение тем: переменные переопределяются префиксом `dark-*`, при этом навигационный сайдбар сохраняет глубокий черничный оттенок, а контрастность текстов строго соответствует стандартам доступности WCAG AA.

---

## 3. Типографика

- **Основной шрифт интерфейса:** Системный стек Windows `Segoe UI`, `system-ui`, `sans-serif` (нулевая сетевая задержка).
- **Шрифт кода и идентификаторов:** `Consolas`, `monospace`.
- **Табличные цифры:** Номера позиций, тайминги хронометража и счетчики прогресса используют моноширинные пропорции цифр (`font-variant-numeric: tabular-nums`).
- **Иерархия:** Заголовки экранов (`headline`: 26px / 650), заголовки разделов (`title`: 17px / 650), основной текст (`body`: 14px), подписи и бейджи (`label`: 12px), служебные сноски (`helper`: 11px / 1.6).

---

## 4. Сетка, компоновка и адаптивность

- **Оконная модель:** Приложение занимает 100% высоты рабочей области (`100dvh`). Минимальный габарит окна — 940×640px.
- **Ширина навигации:** 226px на экранах от 1250px, адаптивно сужается до 206px и 188px на компактных разрешениях.
- **Колонки таблицы TanStack:**
  - Чекбокс выбора: 38px
  - Позиция: 48px
  - Название и артист: гибкая область (`minmax(130px, 1fr)`)
  - Результат поиска: 158px
  - Назначение: 140px
  - Хронометраж: 62px
  - Кнопка разбора: 32px
- **Инспектор коллекции:**
  - Поддерживает два режима: параллельный (колонки рядом) и последовательный (вертикальный стек).
  - Свободная регулировка ширины перетаскиванием границы (от 340px до 800px) с сохранением позиции в `localStorage`.
  - При ширине окна менее 1250px инспектор трансформируется в аккуратный оверлей поверх таблицы с собственной кнопкой закрытия.

---

## 5. Компоненты интерфейса

### Интеллектуальный экран «Начало» (`StartPage.tsx`)

Анализирует состояние коллекции и выводит одно главное действие по контексту:

- нет библиотеки -> переход к импорту или подключению VK;
- не завершен поиск -> кнопка продолжения фонового поиска;
- есть совпадения -> предложение пакетного подтверждения;
- есть спорные треки -> переход к пошаговому разбору версий;
- план готов -> запуск переноса в Spotify.

### Сегментированные радио-карточки (`features/settings/Preferences.tsx`)

Блок выбора провайдера поиска использует интерактивные карточки с кастомным радио-маркером, индикатором фокуса, мягким свечением активного элемента и поддержкой клавиатуры (`Tab`, `Space`, `Enter`).

### Виртуализированная таблица (`features/library/table/TrackTable.tsx`)

Рендерит только видимые в окне строки через `@tanstack/react-virtual`; полная модель таблицы для скрытых строк не создаётся. Производительность проверяется синтетическим сценарием из `tools/performance/benchmark.cjs`.

### Встроенные аудиоплееры предпрослушивания

Компактные плееры встроены в карточки треков инспектора для быстрого сравнения звучания спорных версий без открытия сторонних браузеров.

### Доступные кнопки с подсказками (`ExplainedButton.tsx`)

Заблокированные действия остаются доступными для клавиатурного фокуса, выводя всплывающую подсказку через Portal с подробным объяснением причины (например, время до окончания кулдауна API).

---

## 6. Принципы дизайна (Do's and Don'ts)

- **Do:** Всегда отображать исходные данные VK неизменными рядом с полями рабочей копии.
- **Do:** Сохранять явную видимость исключенных записей (зачеркивание в рабочей копии без удаления из базы).
- **Do:** Предоставлять возможность отмены любого массового или точечного действия (`Undo`).
- **Don't:** Не использовать декоративные нефункциональные анимации, замедляющие работу со списком.
- **Don't:** Не прятать сообщения об ошибках или платформенных лимитах внешних API за абстрактными спиннерами.
- **Don't:** Не производить скрытых автоматических склеек повторов или переименований без подтверждения пользователя.
