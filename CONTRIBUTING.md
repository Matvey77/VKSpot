# Вклад в VKSpot

Спасибо за интерес к проекту! Ниже — короткая карта для участников.

## Куда обращаться

- **Вопросы по установке, прокси и работе с сервисами:** [Discussions](https://github.com/Matvey77/VKSpot/discussions).
- **Ошибки и идеи:** [Issues](https://github.com/Matvey77/VKSpot/issues/new/choose) (не прикладывай личную `collection.db`, cookies или токены).
- **Уязвимости безопасности:** смотри [SECURITY.md](SECURITY.md).

## Как устроен проект и правила изменений

- Первый запуск и карта документации: [README.md](README.md#для-разработчиков).
- Продуктовые и дизайн-инварианты: [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md).
- Архитектура модулей и процессы интеграций: [docs/architecture.md](docs/architecture.md), [docs/workflows.md](docs/workflows.md).
- Стандарты изменений, версионирования и коммитов: [AGENTS.md](AGENTS.md).
- Сборка установщиков и тесты: [docs/maintenance.md](docs/maintenance.md).

## Проверки перед Pull Request

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

Для изменений поведения приложения дополнительно запускай E2E-сценарии на изолированном `VKSPOT_DATA_DIR` (см. [docs/maintenance.md](docs/maintenance.md)).
