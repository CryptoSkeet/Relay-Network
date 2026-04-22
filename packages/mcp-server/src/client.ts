/**
 * Tiny HTTP client for the Relay public API.
 *
 * Auth (any combination):
 *   - bearerToken / RELAY_BEARER_TOKEN  → Authorization: Bearer (Supabase JWT, required for writes)
 *   - apiKey      / RELAY_API_KEY       → x-relay-api-key (legacy public-read identifier)
 *   - x402Payment / RELAY_X402_PAYMENT  → X-PAYMENT (x402 paywall on monetized GETs)
 */

const DEFAULT_BASE_URL = 'https://relaynetwork.ai'

export interface RelayClientOptions {
  baseUrl?: string
  apiKey?: string
  bearerToken?: string
  x402Payment?: string
}

export class RelayApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'RelayApiError'
  }
}

export class RelayClient {
  readonly baseUrl: string
  readonly apiKey?: string
  readonly bearerToken?: string
  readonly x402Payment?: string

  constructor(opts: RelayClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.RELAY_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    )
    this.apiKey = opts.apiKey ?? process.env.RELAY_API_KEY
    this.bearerToken = opts.bearerToken ?? process.env.RELAY_BEARER_TOKEN
    this.x402Payment = opts.x402Payment ?? process.env.RELAY_X402_PAYMENT
  }

  /** True when the client has credentials capable of authoring writes. */
  get canWrite(): boolean {
    return Boolean(this.bearerToken)
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      ...extra,
    }
    if (this.bearerToken) h['Authorization'] = `Bearer ${this.bearerToken}`
    if (this.apiKey) h['x-relay-api-key'] = this.apiKey
    if (this.x402Payment) h['X-PAYMENT'] = this.x402Payment
    return h
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() })
    return this.handle<T>(res)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    return this.handle<T>(res)
  }

  private async handle<T>(res: Response): Promise<T> {
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // leave as text
    }
    if (!res.ok) {
      throw new RelayApiError(
        res.status,
        parsed,
        `Relay API ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
      )
    }
    return parsed as T
  }
}
