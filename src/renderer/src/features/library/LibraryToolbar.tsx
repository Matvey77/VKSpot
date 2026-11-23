import { ListFilter, Search, ShieldCheck, X } from 'lucide-react'
import { destinationLabels as labels, type LibraryFilter } from '../../../../core/library'
import { searchResultLabels, type SearchResultGroup } from '../../../../core/matching'
import { formatCount } from '../../../../shared/ru'
import { SpotifyIcon } from '../../components/brand/BrandIcons'
import ExplainedButton from '../../components/ui/ExplainedButton'
import IconButton from '../../components/ui/IconButton'

const quickFilters: LibraryFilter[] = ['all', 'unresolved', 'spotify', 'local', 'excluded']

export function CollectionQuickFilters({
  query,
  filter,
  resultFilter,
  destinationSummary,
  onSelectQuickFilter,
}: {
  query: string
  filter: LibraryFilter
  resultFilter: 'all' | SearchResultGroup
  destinationSummary: Record<LibraryFilter, number>
  onSelectQuickFilter: (value: LibraryFilter) => void
}) {
  return (
    <div className="collection-navigation">
      <div className="collection-facets" role="group" aria-label="Быстрые фильтры коллекции">
        {quickFilters.map((value) => (
          <button
            key={value}
            aria-pressed={filter === value && resultFilter === 'all' && !query}
            onClick={() => onSelectQuickFilter(value)}
          >
            {value === 'spotify' && <SpotifyIcon size={15} />}
            {labels[value]}
            <span>{formatCount(destinationSummary[value])}</span>
          </button>
        ))}
      </div>
      <span className="collection-safety">
        <ShieldCheck size={15} aria-hidden="true" /> Оригинал сохранён
      </span>
    </div>
  )
}

export function LibraryToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  resultFilter,
  onResultFilterChange,
  onResetFilters,
  baseCount,
  destinationCounts,
  resultCounts,
  visibleCount,
  matchingCount,
  busy,
  onSelectAllVisible,
  onSelectMatches,
}: {
  query: string
  onQueryChange: (q: string) => void
  filter: LibraryFilter
  onFilterChange: (f: LibraryFilter) => void
  resultFilter: 'all' | SearchResultGroup
  onResultFilterChange: (rf: 'all' | SearchResultGroup) => void
  onResetFilters: () => void
  baseCount: number
  destinationCounts: Record<LibraryFilter, number>
  resultCounts: Record<SearchResultGroup, number>
  visibleCount: number
  matchingCount: number
  busy: boolean
  onSelectAllVisible: () => void
  onSelectMatches: () => void
}) {
  return (
    <>
      <div className="library-tools">
        <div className="search-input">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Найти запись"
            placeholder="Исполнитель, название или ID VK"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        <label className="library-filter">
          <span>Решение о переносе</span>
          <div className="filter-select">
            <ListFilter size={16} aria-hidden="true" />
            <select
              aria-label="Решение о переносе"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value as LibraryFilter)}
            >
              {Object.entries(labels).map(([key, name]) => (
                <option key={key} value={key}>
                  {name} ({formatCount(destinationCounts[key as LibraryFilter])})
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="library-filter">
          <span>Результат поиска</span>
          <select
            aria-label="Результат поиска"
            title="Последняя выдача Spotify. Этот фильтр применяется вместе с решением и текстовым поиском."
            value={resultFilter}
            onChange={(event) =>
              onResultFilterChange(event.target.value as 'all' | SearchResultGroup)
            }
          >
            <option value="all">Все результаты ({formatCount(baseCount)})</option>
            {Object.entries(searchResultLabels).map(([group, label]) => (
              <option key={group} value={group}>
                {label} ({formatCount(resultCounts[group as SearchResultGroup])})
              </option>
            ))}
          </select>
        </label>
        {(query || filter !== 'all' || resultFilter !== 'all') && (
          <IconButton title="Сбросить фильтры" onClick={onResetFilters}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <div className="table-selection-tools">
        <button disabled={!visibleCount || busy} onClick={onSelectAllVisible}>
          Выделить выборку ({formatCount(visibleCount)})
        </button>
        <ExplainedButton
          hintLabel="Почему нельзя выделить совпадения"
          reason={
            busy
              ? 'Дождись завершения текущего действия.'
              : !matchingCount
                ? 'В этой выборке пока нет записей «Совпадают данные». Можно изменить фильтры или дождаться результатов поиска.'
                : undefined
          }
          onClick={onSelectMatches}
        >
          Выделить совпадения ({formatCount(matchingCount)})
        </ExplainedButton>
        <span className="selection-help">
          Shift + клик — выделить диапазон. Подтверждаются только записи без решения.
        </span>
      </div>
    </>
  )
}
