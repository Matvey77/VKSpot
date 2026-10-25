# VKSpot

Локальное Windows-приложение для архивации личной медиатеки VK и подготовки проверяемого переноса в Spotify. Оригинальный порядок, версии и намеренные повторы сохраняются; спорные варианты подтверждает пользователь.

## Разработка

Требуется Node.js 24 LTS. Из корня репозитория:

```powershell
npm ci
npm run dev
```

Полезные проверки: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`. Windows-сборка: `npm run dist:win`.

## Документы

- [AGENTS.md](AGENTS.md) — правила изменений, экономии контекста, сборок и коммитов.
- [PRODUCT.md](PRODUCT.md) — продуктовые инварианты и ограничения.
- [DESIGN.md](DESIGN.md) — интерфейсная система и токены.
- [docs/architecture.md](docs/architecture.md) — границы кода, хранения и синхронизации.
- [docs/workflows.md](docs/workflows.md) — импорт, поиск, разбор и перенос.
- [docs/maintenance.md](docs/maintenance.md) — инструменты, производительность и проверка.
- [SECURITY.md](SECURITY.md) — модель приватности и сообщение об уязвимостях.

Готовый дистрибутив не требует установленного Node.js. См. также [LICENSE](LICENSE).
