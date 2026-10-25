# Коллекция

Primary target: `src/renderer/src/features/library/LibraryView.tsx`
Related targets: `src/renderer/src/features/library/inspector/Inspector.tsx`, `src/renderer/src/styles/workspace.css`.
Mode: Operate.

- Список, фильтры и массовые действия независимы от полноразмерного инспектора.
- Инспектор сравнивает оригинал, кандидатов и рабочую копию; сохраняет черновики при переходах по выборке.
- В компактном окне: оверлей, inert списка, Escape и возврат фокуса.
- Общий визуальный контракт — [DESIGN.md](../../DESIGN.md); продуктовые ограничения — [PRODUCT.md](../../PRODUCT.md).
