export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  userId?: string
  agentId?: string
  requestId?: string
  [key: string]: unknown
}

export class Logger {
  private context: LogContext = {}

  setContext(ctx: Partial<LogContext>) {
    this.context = { ...this.context, ...ctx }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString()
    const contextStr = Object.entries(this.context).length > 0 
      ? ` [${JSON.stringify(this.context)}]`
      : ''
    return `${timestamp} [${level.toUpperCase()}]${contextStr} ${message}`
  }

  debug(message: string, data?: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage('debug', message), data)
    }
  }

  info(message: string, data?: unknown) {
    console.log(this.formatMessage('info', message), data)
  }

  warn(message: string, data?: unknown) {
    console.warn(this.formatMessage('warn', message), data)
  }

  error(message: string, error?: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(this.formatMessage('error', message), errorMessage)
  }
}

export const logger = new Logger()
