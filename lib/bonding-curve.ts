/**
 * lib/bonding-curve.ts
 *
 * Relay Agent Token Bonding Curve
 * Adapted from Virtuals Protocol + code4rena audit findings.
 *
 * Mechanics:
 *   - Constant product AMM: x * y = k
 *   - Virtual reserves bootstrap liquidity from day 1 (no cold-start)
 *   - Graduation at 69,000 RELAY raised → migrate to Raydium CPMM
 *   - 24h minimum age gate → prevents flashloan graduation attacks
 *   - 1% protocol fee on every buy/sell
 *
 * Token supply:          1,000,000,000 (1B), 6 decimals
 * Virtual RELAY reserve: 30 RELAY  (bootstraps initial price)
 * Virtual token reserve: 1,073,000,191 tokens
 * Graduation threshold:  69,000 RELAY raised in real buys
 *
 * NOTE: All amounts in RELAY units (not base units ×10^6).
 * API routes must divide incoming base-unit amounts before calling these functions.
 */

export const TOTAL_SUPPLY          = 1_000_000_000;
export const TOKEN_DECIMALS        = 6;
export const VIRTUAL_RELAY_RESERVE = 30;
export const VIRTUAL_TOKEN_RESERVE = 1_073_000_191;
export const GRADUATION_THRESHOLD  = 69_000;
export const PROTOCOL_FEE_BPS      = 100;   // 1%
export const MIN_AGE_HOURS         = 24;    // anti-flashloan gate

export interface BuyResult {
  tokensOut:       number;
  fee:             number;
  newRelayReserve: number;
  newTokenReserve: number;
  pricePerToken:   number;
}

export interface SellResult {
  relayOut:        number;
  fee:             number;
  newRelayReserve: number;
  newTokenReserve: number;
  pricePerToken:   number;
}

export interface GraduationCheck {
  eligible: boolean;
  reason?:  string;
  progress?: number;
}

export interface CurveState {
  real_relay_reserve: number;
  real_token_reserve: number;
  graduated:          boolean;
  created_at:         string;
}

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

export function calcBuy(relayIn: number, realRelay: number, realTokens: number): BuyResult {
  const fee      = relayIn * (PROTOCOL_FEE_BPS / 10_000);
  const relayNet = relayIn - fee;

  const vRelay  = realRelay  + VIRTUAL_RELAY_RESERVE;
  const vTokens = realTokens + VIRTUAL_TOKEN_RESERVE;
  const k       = vRelay * vTokens;

  const newVRelay  = vRelay + relayNet;
  const newVTokens = k / newVRelay;
  const tokensOut  = vTokens - newVTokens;

  if (tokensOut <= 0)         throw new Error("Insufficient liquidity");
  if (tokensOut > realTokens) throw new Error("Exceeds available supply");

  return {
    tokensOut,
    fee,
    newRelayReserve: realRelay  + relayNet,
    newTokenReserve: realTokens - tokensOut,
    pricePerToken:   relayNet / tokensOut,
  };
}

export function calcSell(tokensIn: number, realRelay: number, realTokens: number): SellResult {
  const vRelay  = realRelay  + VIRTUAL_RELAY_RESERVE;
  const vTokens = realTokens + VIRTUAL_TOKEN_RESERVE;
  const k       = vRelay * vTokens;

  const newVTokens = vTokens + tokensIn;
  const newVRelay  = k / newVTokens;
  const relayGross = vRelay - newVRelay;
  const fee        = relayGross * (PROTOCOL_FEE_BPS / 10_000);
  const relayOut   = relayGross - fee;

  if (relayOut <= 0)        throw new Error("Insufficient liquidity");
  if (relayOut > realRelay) throw new Error("Insufficient RELAY reserve");

  return {
    relayOut,
    fee,
    newRelayReserve: realRelay  - relayOut,
    newTokenReserve: realTokens + tokensIn,
    pricePerToken:   relayOut / tokensIn,
  };
}

export function getPrice(realRelay: number, realTokens: number): number {
  return (realRelay + VIRTUAL_RELAY_RESERVE) / (realTokens + VIRTUAL_TOKEN_RESERVE);
}

export function getMarketCap(realRelay: number, realTokens: number): number {
  return getPrice(realRelay, realTokens) * TOTAL_SUPPLY;
}

export function isGraduationEligible(curveState: CurveState): GraduationCheck {
  if (curveState.graduated) return { eligible: false, reason: "Already graduated" };

  if (curveState.real_relay_reserve < GRADUATION_THRESHOLD) {
    const remaining = GRADUATION_THRESHOLD - curveState.real_relay_reserve;
    return {
      eligible: false,
      reason:   `Need ${remaining.toFixed(0)} more RELAY to graduate`,
      progress: curveState.real_relay_reserve / GRADUATION_THRESHOLD,
    };
  }

  const ageHours = (Date.now() - new Date(curveState.created_at).getTime()) / 3_600_000;
  if (ageHours < MIN_AGE_HOURS) {
    return {
      eligible: false,
      reason:   `Must be ≥${MIN_AGE_HOURS}h old (${ageHours.toFixed(1)}h so far)`,
    };
  }

  return { eligible: true, progress: 1.0 };
}

export function getCurveSummary(curveState: CurveState) {
  const { real_relay_reserve: r, real_token_reserve: t } = curveState;
  const price    = getPrice(r, t);
  const mcap     = getMarketCap(r, t);
  const progress = Math.min(r / GRADUATION_THRESHOLD, 1);
  return {
    price:              price.toFixed(8),
    marketCap:          `${mcap.toFixed(0)} RELAY`,
    graduationProgress: `${(progress * 100).toFixed(1)}%`,
    relayRaised:        r.toFixed(2),
    relayToGraduation:  Math.max(0, GRADUATION_THRESHOLD - r).toFixed(0),
    readyToGraduate:    isGraduationEligible(curveState).eligible,
  };
}
