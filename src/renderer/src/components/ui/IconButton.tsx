import type { ReactNode } from 'react'

interface IconButtonProps {
  children: ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function IconButton({ children, title, onClick, disabled, className }: IconButtonProps) {
  return (
    <button
      className={`icon-button ${className ?? ''}`.trim()}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default IconButton
