import { NextRequest } from 'next/server'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

interface LogContext {
  userId?: string
  agentId?: string
  requestId?: string
  sessionId?: string
  ip?: string
  userAgent?: string
  url?: string
  method?: string
  statusCode?: number
  duration?: number
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
  performance?: {
    duration: number
    memoryUsage?: number
  }
}

class ProductionLogger {
  private context: LogContext = {}
  private requestId: string | null = null

  setContext(ctx: Partial<LogContext>) {
    this.context = { ...this.context, ...ctx }
  }

  setRequestId(id: string) {
    this.requestId = id
    this.context.requestId = id
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Create a request-scoped logger with the request ID extracted from headers.
   * Uses x-request-id header if present, otherwise generates a new ID.
   */
  forRequest(request: NextRequest): ProductionLogger {
    const child = new ProductionLogger()
    child.context = { ...this.context }
    const requestId = request.headers.get('x-request-id') ?? this.generateRequestId()
    child.setRequestId(requestId)
    child.setContext({
      method: request.method,
      url: request.url,
    })
    return child
  }

  private formatEntry(entry: LogEntry): string {
    // Structured JSON logging for production
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(entry)
    }

    // Human-readable format for development
    const contextStr = entry.context && Object.keys(entry.context).length > 0
      ? ` [${JSON.stringify(entry.context)}]`
      : ''
    return `${entry.timestamp} [${entry.level.toUpperCase()}]${contextStr} ${entry.message}`
  }

  private writeLog(entry: LogEntry) {
    const formatted = this.formatEntry(entry)

    switch (entry.level) {
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(formatted)
        }
        break
      case 'info':
        console.log(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
      case 'fatal':
        console.error(formatted)
        // In production, send to error tracking service
        if (process.env.NODE_ENV === 'production') {
          this.sendToErrorTracker(entry)
        }
        break
    }
  }

  private async sendToErrorTracker(entry: LogEntry) {
    // Placeholder for error tracking integration (Sentry, LogRocket, etc.)
    // This would send errors to your monitoring service
    try {
      // Example: Send to Sentry or similar
      // await Sentry.captureException(entry.error, { contexts: { custom: entry.context } })
      console.error('Error sent to tracking service:', entry)
    } catch (trackingError) {
      console.error('Failed to send error to tracking service:', trackingError)
    }
  }

  private createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context }
    }

    if (data) {
      if (data instanceof Error) {
        entry.error = {
          name: data.name,
          message: data.message,
          stack: process.env.NODE_ENV === 'production' ? undefined : data.stack
        }
      } else if (typeof data === 'object' && data !== null) {
        entry.context = { ...entry.context, ...data }
      } else {
        entry.context = { ...entry.context, data }
      }
    }

    return entry
  }

  debug(message: string, data?: unknown) {
    this.writeLog(this.createEntry('debug', message, data))
  }

  info(message: string, data?: unknown) {
    this.writeLog(this.createEntry('info', message, data))
  }

  warn(message: string, data?: unknown) {
    this.writeLog(this.createEntry('warn', message, data))
  }

  error(message: string, error?: unknown, context?: LogContext) {
    const entry = this.createEntry('error', message, error)
    if (context) {
      entry.context = { ...entry.context, ...context }
    }
    this.writeLog(entry)
  }

  fatal(message: string, error?: unknown, context?: LogContext) {
    const entry = this.createEntry('fatal', message, error)
    if (context) {
      entry.context = { ...entry.context, ...context }
    }
    this.writeLog(entry)
  }

  // Performance monitoring
  time(label: string) {
    this.context[`${label}_start`] = Date.now()
  }

  timeEnd(label: string, additionalContext?: LogContext) {
    const startTime = this.context[`${label}_start`] as number
    if (startTime) {
      const duration = Date.now() - startTime
      const context = {
        duration,
        label,
        ...additionalContext
      }
      this.info(`Performance: ${label}`, context)
      delete this.context[`${label}_start`]
    }
  }

  // Request logging middleware helper
  logRequest(request: NextRequest, responseStatus: number, duration: number) {
    const requestId = request.headers.get('x-request-id')
    if (requestId && !this.requestId) {
      this.setRequestId(requestId)
    }

    const context: LogContext = {
      method: request.method,
      url: request.url,
      statusCode: responseStatus,
      duration,
      requestId: this.requestId ?? requestId ?? undefined,
      ip: (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined
    }

    if (responseStatus >= 400) {
      this.warn(`HTTP ${responseStatus}`, context)
    } else {
      this.info(`HTTP ${responseStatus}`, context)
    }
  }
}

export const logger = new ProductionLogger()

// Global error handler for uncaught exceptions
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled promise rejection', reason, { promise: promise.toString() })
    process.exit(1)
  })
}
