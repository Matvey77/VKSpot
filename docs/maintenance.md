# Поддержка и проверка

## Разработка и утилиты

Требуется Node.js 24 LTS; установка из корня — `npm ci`. Запуск — `npm run dev`. Полезные команды: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run dist:win`.

Правила версий, сборок и коммитов: [AGENTS.md](../AGENTS.md). Установщик — `release/<version>/VKSpot Setup <version>.exe`. Пакет сохраняет локали Chromium `ru` и `en-US`; другие локали интерфейса Chromium используют fallback, содержимое сайтов и Unicode-треки сохраняются.

Проверка готовой сборки в PowerShell:

```powershell
$env:VKSPOT_TEST_EXECUTABLE = (Resolve-Path "release/$((Get-Content package.json -Raw | ConvertFrom-Json).version)/win-unpacked/VKSpot.exe").Path
npm run test:e2e
```

`node tools/icons/generate.cjs` растрирует `resources/icon.svg`. `node tools/guide/capture.cjs` делает снимки руководства; `node tools/guide/capture-collection-options.cjs` обновляет только снимки настроек коллекции. `node tools/guide/capture-readme.cjs` после сборки обновляет снимки README в `docs/images/`. Захват использует временный профиль и синтетические данные, не аккаунт пользователя. `tools/` не входит в дистрибутив.

Windows helper открывает Spotify и читает доступные UI Automation-контролы; массовая вставка через него не реализована. Документация и демонстрационные дубли не включаются в приложение. Путь к пользовательской `collection.db` показан в настройках; резервную копию делай полным архивом VKSpot. Личные базы, профили и готовые сборки не очищай при уборке исходников.

## Производительность

Профиль: `npm run build`, затем `npm run perf`. Сценарий запускает Electron на синтетических 9000 строках, с двумя кандидатами на строку, выполняет 12 правок, поиск по последней строке и открытие инспектора. Сеть и реальные аккаунты не используются. Результат — `.local/performance/latest.json`; `VKSPOT_TEST_EXECUTABLE` задаёт exe для сравнения, `BENCHMARK_OUTPUT` — путь результата.

Сохранять дельта-синхронизацию с ограниченным журналом и полным восстановлением, стабильные ссылки неизменённых строк, виртуализацию видимых строк, раздельное хранение больших деталей заданий и ленивую загрузку руководства. Производительность UI не оценивать по одному DOM-виртуализатору: проверять также модель данных и объём IPC.

## Брендовые и демонстрационные ассеты

VK SVG происходит из официального бренд-пакета [VK](https://corp.vkcdn.ru/media/projects/logos/projects-logo-1_OFwexq4.svg); Spotify SVG — из [Spotify Design Guidelines](https://developer.spotify.com/images/guidelines/design/2024-spotify-logo-icon.zip), справочник — [Spotify Design](https://developer.spotify.com/documentation/design). Геометрия сервисных знаков сохраняется в `src/renderer/src/components/brand/BrandIcons.tsx`. Знаки используются для идентификации интеграций и не означают одобрение VK/Spotify; MIT не распространяет права на чужие товарные знаки. Скриншоты руководства создаются изолированным инструментом на синтетической медиатеке.

## Проверка границ

Автотесты используют синтетические фикстуры и изолированные профили, не личные архивы, cookies или реальные потоки. E2E проверяет Electron и интеграционные сценарии на моках. Перф-тест не доказывает скорость сети или корректность изменившейся разметки VK/Spotify. Не записывать секреты и персональные данные в исходники, тесты и логи.
