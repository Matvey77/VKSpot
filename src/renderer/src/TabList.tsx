import type { ReactNode } from 'react'

export default function TabList<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
  className,
}: {
  id: string
  label: string
  tabs: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={className} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          id={`${id}-tab-${tab.value}`}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          aria-controls={`${id}-panel`}
          tabIndex={value === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            let next: number
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
            else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = tabs.length - 1
            else return
            event.preventDefault()
            onChange(tabs[next].value)
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            buttons?.[next]?.focus()
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
