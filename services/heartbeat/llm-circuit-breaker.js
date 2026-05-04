/**
 * Process-wide LLM circuit breaker.
 *
 * Backstory: when the Anthropic account runs out of credits, every heartbeat
 * for every agent fires its own LLM call, every one of them gets a 400
 * "credit balance too low", and Railway logs blow up with thousands of
 * identical errors per minute. That also wastes API quota on requests
 * that cannot succeed and drowns real signal.
 *
 * This module keeps a single in-memory `openUntil` timestamp. When an LLM
 * response is recorded as "structural failure" (no-credit / auth / rate
 * limit), the breaker opens for COOLDOWN_MS. While open, callers throw
 * BreakerOpenError immediately without making the network call.
 *
 * One success closes it. Repeated failures bump the cooldown (capped).
 */

const COOLDOWN_BASE_MS = 5 * 60 * 1000;   // 5 min
const COOLDOWN_MAX_MS  = 60 * 60 * 1000;  // 1 h
const LOG_THROTTLE_MS  = 60 * 1000;       // log "still open" at most every 60s

let openUntil = 0;
let consecutiveFailures = 0;
let lastLoggedAt = 0;
let lastReason = '';

export class BreakerOpenError extends Error {
  constructor(reason, msUntilRetry) {
    super(`LLM circuit breaker OPEN (${reason}); retry in ${Math.round(msUntilRetry / 1000)}s`);
    this.name = 'BreakerOpenError';
    this.reason = reason;
    this.msUntilRetry = msUntilRetry;
  }
}

/**
 * Throw BreakerOpenError if the breaker is currently open.
 * Call this BEFORE the fetch.
 */
export function assertBreakerClosed() {
  const now = Date.now();
  if (openUntil > now) {
    const ms = openUntil - now;
    if (now - lastLoggedAt > LOG_THROTTLE_MS) {
      console.warn(`[llm-breaker] OPEN — skipping LLM call (${lastReason}); ${Math.round(ms / 1000)}s remaining`);
      lastLoggedAt = now;
    }
    throw new BreakerOpenError(lastReason, ms);
  }
}

/**
 * Record an LLM response. Pass `status` (HTTP code) and a snippet of the
 * response body. Opens the breaker on credit / auth / 429 errors.
 *
 * Call this AFTER the fetch completes, before throwing on !res.ok.
 */
export function recordResponse(status, bodyText = '') {
  if (status >= 200 && status < 300) {
    if (consecutiveFailures > 0) {
      console.log('[llm-breaker] CLOSED — LLM call succeeded after failure');
    }
    consecutiveFailures = 0;
    openUntil = 0;
    lastReason = '';
    return;
  }

  // Anthropic returns 400 (not 402) for "credit balance too low".
  const lower = bodyText.toLowerCase();
  const isCreditError =
    lower.includes('credit balance is too low') ||
    lower.includes('credit balance too low') ||
    lower.includes('insufficient_quota');
  const isAuthError = status === 401 || status === 403;
  const isRateLimit = status === 429;

  if (!isCreditError && !isAuthError && !isRateLimit) {
    // Transient — don't trip the breaker (e.g. 500 from upstream, single 400 schema bug).
    return;
  }

  consecutiveFailures += 1;
  const cooldown = Math.min(
    COOLDOWN_BASE_MS * Math.pow(2, consecutiveFailures - 1),
    COOLDOWN_MAX_MS,
  );
  openUntil = Date.now() + cooldown;
  lastReason = isCreditError
    ? 'credit balance too low'
    : isAuthError
    ? `auth ${status}`
    : `rate limit ${status}`;
  lastLoggedAt = Date.now();
  console.error(
    `[llm-breaker] OPEN for ${Math.round(cooldown / 1000)}s — ${lastReason} ` +
      `(consecutive failures: ${consecutiveFailures})`,
  );
}

export function getBreakerState() {
  return {
    open: Date.now() < openUntil,
    msUntilRetry: Math.max(0, openUntil - Date.now()),
    consecutiveFailures,
    lastReason,
  };
}
