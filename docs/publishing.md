# Публикация на GitHub

## Репозиторий

1. Создай пустой публичный репозиторий без автоматически созданных README, лицензии и `.gitignore`: они уже есть в проекте.
2. Добавь его URL как `origin` и отправь выбранную ветку. Не загружай папку проекта целиком через браузер: публикуй отслеживаемые Git файлы.
3. Дождись успешного **Checks** в Actions. Включи Issues, Dependabot alerts, secret scanning, push protection и Private vulnerability reporting в настройках репозитория. См. [рекомендации GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories).

Перед первой отправкой проверь `git status --short`, `git ls-files` и историю: `.gitignore` не исключает уже закоммиченные данные. Если обнаружен секрет, отзови его и очисти историю по [инструкции GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

В исходники входят код, lockfile, тесты, документация и используемые ресурсы. `node_modules/`, `out/`, `release/`, `.local/`, локальные дизайн-кэши, базы, профили и ключи не публикуются. Исходники и готовые установщики распространяются отдельно.

## Windows-релиз

Команды сборки, версия и проверка готового EXE — в [maintenance.md](maintenance.md) и [AGENTS.md](../AGENTS.md).

Workflow **Checks** собирает Windows x64 установщик, запускает unit и E2E на упакованном `VKSpot.exe`. После успешных проверок установщик и `SHA256SUMS.txt` доступны в артефакте `windows-installer` в течение 14 дней. Ручной запуск доступен через **Actions → Checks → Run workflow**. Workflow не публикует релиз автоматически.

1. Выбери проверенный коммит с нужной версией `package.json` и соответствующий успешный запуск Checks. Скачай `windows-installer`.
2. Создай GitHub Release с тегом `v<версия>` на этом коммите. Приложи EXE и `SHA256SUMS.txt`; служебные каталоги и профили не добавляй.
3. Кратко опиши изменения, укажи Windows x64 и ограничения интеграций из [README](../README.md). Опубликуй релиз — после этого инструкция установки из README станет доступна пользователям.

Если собираешь локально, после проверок вычисли контрольную сумму установщика: `Get-FileHash -Algorithm SHA256 "release/<версия>/VKSpot Setup <версия>.exe"`. Публикуй сумму именно приложенного файла.

## Что сохранять

Не удаляй тесты, lockfile и руководство внутри приложения ради уменьшения размера репозитория. Производные локальные файлы Impeccable исключены; источник дизайн-контракта — [DESIGN.md](../DESIGN.md). Личные базы, профили и старые локальные установщики не относятся к уборке публичных исходников.
