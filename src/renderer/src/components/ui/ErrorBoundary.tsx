import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
  resetLabel?: string
  resetKey?: string | number
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('VKSpot UI error boundary caught an error:', error, info)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  private handleReset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const { title = 'Произошла ошибка интерфейса', resetLabel = 'На обзор', onReset } = this.props

    return (
      <div
        role="alert"
        style={{
          flex: 1,
          minHeight: '280px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          background: 'var(--canvas)',
          color: 'var(--ink)',
        }}
      >
        <div
          className="simple-empty"
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '32px 28px',
            gap: '12px',
          }}
        >
          <h2>{title}</h2>
          <p>
            Раздел столкнулся с неожиданной ошибкой. Локальные коллекции и сохранённые решения не
            пострадали.
          </p>
          {error.message && (
            <code
              style={{
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                padding: '6px 10px',
                borderRadius: 'var(--radius-tag)',
                background: 'var(--hover)',
                color: 'var(--muted)',
              }}
            >
              {error.message}
            </code>
          )}
          <div className="button-row" style={{ marginTop: '8px', justifyContent: 'center' }}>
            <button type="button" className="primary" onClick={this.handleRetry}>
              Повторить
            </button>
            {onReset && (
              <button type="button" onClick={this.handleReset}>
                {resetLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
