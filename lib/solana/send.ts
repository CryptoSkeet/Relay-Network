/**
 * sendAndConfirm — the ONE transaction-sending function Relay uses.
 *
 * Everything (user wallet txns, agent autonomous payments, Anchor program
 * calls) goes through this. Centralizing it means:
 *   - One place to tune priority fees
 *   - One place to add retries / metrics / Sentry later
 *   - One place to enforce CU budgets so we don't overpay
 *
 * Server-only. Do not import from client components.
 */

import 'server-only'

import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  estimateComputeUnitLimitFactory,
  getSignatureFromTransaction,
  isSolanaError,
  pipe,
  prependTransactionMessageInstructions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
  type Commitment,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from '@solana/kit'
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget'

import { getRpc, getRpcSubscriptions } from './rpc'

export type SendOptions = {
  /** Defaults to "confirmed". Use "finalized" for high-value flows. */
  commitment?: Commitment
  /**
   * Override priority fee (micro-lamports per CU).
   * If omitted, we sample recent fees and pick the 75th percentile.
   */
  priorityFeeMicroLamports?: bigint
  /**
   * Safety margin on top of the simulated CU estimate. Default 1.1 (+10%).
   * Simulations are not always exact; underestimating causes mid-tx failure.
   */
  computeUnitBufferMultiplier?: number
}

export type SendResult = {
  signature: Signature
  computeUnitsEstimated: number
  priorityFeeMicroLamports: bigint
}

export class RelaySendError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'BLOCKHASH_EXPIRED'
      | 'SIMULATION_FAILED'
      | 'SEND_FAILED'
      | 'UNKNOWN',
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RelaySendError'
  }
}

const FEE_FLOOR = BigInt(1000)

// SetComputeUnitLimit + SetComputeUnitPrice each cost ~150 CU. We estimate
// CU without them (they don't exist in the message yet) and then prepend.
// Add this fixed overhead so the limit covers the budget ixs themselves.
const COMPUTE_BUDGET_IX_OVERHEAD = 300

// Lazy factory cache — built on first send so the throws inside getRpc() /
// getRpcSubscriptions() never fire at module import.
let _estimator: ReturnType<typeof estimateComputeUnitLimitFactory> | undefined
let _sender: ReturnType<typeof sendAndConfirmTransactionFactory> | undefined

function estimator() {
  if (!_estimator) {
    _estimator = estimateComputeUnitLimitFactory({ rpc: getRpc() })
  }
  return _estimator
}

function sender() {
  if (!_sender) {
    _sender = sendAndConfirmTransactionFactory({
      rpc: getRpc(),
      rpcSubscriptions: getRpcSubscriptions(),
    })
  }
  return _sender
}

/**
 * Sample recent priority fees and return the 75th percentile.
 * Median undershoots during congestion, max overpays. p75 is the standard
 * "land reliably without bleeding" heuristic used by Jupiter, Helius, etc.
 */
async function getRecommendedPriorityFee(): Promise<bigint> {
  try {
    const samples = await getRpc().getRecentPrioritizationFees().send()
    if (samples.length === 0) return FEE_FLOOR

    const fees = samples
      .map((s) => Number(s.prioritizationFee))
      .filter((f) => f > 0)
      .sort((a, b) => a - b)

    if (fees.length === 0) return FEE_FLOOR

    const p75Index = Math.floor(fees.length * 0.75)
    const p75 = fees[p75Index] ?? fees[fees.length - 1]
    return BigInt(Math.max(p75, Number(FEE_FLOOR)))
  } catch {
    return FEE_FLOOR
  }
}

/**
 * Build, sign, and send a transaction; wait for confirmation.
 *
 * @param instructions Program instructions in execution order. We prepend
 *                     compute-budget instructions ourselves — do not include them.
 * @param feePayer     The signer that pays fees. For user txns this is the
 *                     wallet signer from @solana/react. For agent txns it's
 *                     the keychain signer. Same interface either way.
 * @param options      Commitment, priority fee override, CU buffer.
 */
export async function sendAndConfirm(
  instructions: Instruction[],
  feePayer: TransactionSigner,
  options: SendOptions = {},
): Promise<SendResult> {
  if (instructions.length === 0) {
    throw new RelaySendError('No instructions provided', 'UNKNOWN')
  }

  const commitment = options.commitment ?? 'confirmed'
  const buffer = options.computeUnitBufferMultiplier ?? 1.1

  const priorityFeePromise =
    options.priorityFeeMicroLamports !== undefined
      ? Promise.resolve(options.priorityFeeMicroLamports)
      : getRecommendedPriorityFee()

  const blockhashPromise = getRpc().getLatestBlockhash({ commitment }).send()

  const [priorityFeeMicroLamports, { value: latestBlockhash }] = await Promise.all([
    priorityFeePromise,
    blockhashPromise,
  ])

  // Build the message WITHOUT compute-budget instructions first — we need
  // to simulate before knowing the limit to set.
  const baseMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  )

  let computeUnitsEstimated: number
  try {
    computeUnitsEstimated = await estimator()(baseMessage)
  } catch (cause) {
    throw new RelaySendError(
      'Simulation failed (CU estimate)',
      'SIMULATION_FAILED',
      cause,
    )
  }

  const computeUnitLimit =
    Math.ceil(computeUnitsEstimated * buffer) + COMPUTE_BUDGET_IX_OVERHEAD

  // Prepend both compute-budget instructions in one call to avoid TS
  // narrowing the message type between chained prepends.
  const finalMessage = prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
      getSetComputeUnitPriceInstruction({ microLamports: priorityFeeMicroLamports }),
    ],
    baseMessage,
  )

  const signedTx = await signTransactionMessageWithSigners(finalMessage)

  try {
    // Cast: kit's sender requires blockhash-lifetime specifically; the
    // generic TransactionWithLifetime widens to include durable-nonce.
    // We always set blockhash above, so this narrowing is safe.
    await sender()(signedTx as Parameters<ReturnType<typeof sender>>[0], { commitment })
  } catch (cause) {
    if (isSolanaError(cause, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
      throw new RelaySendError(
        'Blockhash expired before confirmation',
        'BLOCKHASH_EXPIRED',
        cause,
      )
    }
    throw new RelaySendError(
      'Failed to send or confirm transaction',
      'SEND_FAILED',
      cause,
    )
  }

  return {
    signature: getSignatureFromTransaction(signedTx),
    computeUnitsEstimated,
    priorityFeeMicroLamports,
  }
}
