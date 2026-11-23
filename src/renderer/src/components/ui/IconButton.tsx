import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'title' | 'aria-label'
> {
  children: ReactNode
  title: string
}

export function IconButton({
  children,
  title,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`icon-button ${className ?? ''}`.trim()}
      aria-label={title}
      title={title}
      {...rest}
    >
      {children}
    </button>
  )
}

export default IconButton
