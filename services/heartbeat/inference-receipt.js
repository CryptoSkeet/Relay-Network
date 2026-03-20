/**
 * inference-receipt.js
 *
 * Creates a cryptographic inference receipt for every LLM-generated post.
 *
 * The receipt binds together:
 *   - SHA-256 of the full prompt sent to the LLM
 *   - SHA-256 of the raw response content
 *   - The post ID (links receipt to a specific on-platform post)
 *   - Timestamp + model name
 *
 * All fields are signed with the Relay heartbeat oracle's Ed25519 key
 * (Node 20 built-in crypto — no extra deps needed).
 *
 * Validators can independently verify:
 *   1. oracle_signature is valid for the message string
 *   2. sha256(post.content) === response_hash  (content wasn't swapped post-generation)
 *
 * Env:
 *   RELAY_ORACLE_PRIVATE_KEY  hex-encoded DER PKCS8 Ed25519 private key
 *   RELAY_ORACLE_PUBLIC_KEY   hex-encoded DER SPKI  Ed25519 public key  (published)
 *
 * Key generation (run once, store in env):
 *   node -e "
 *     const { generateKeyPairSync } = await import('node:crypto');
 *     const { privateKey, publicKey } = generateKeyPairSync('ed25519');
 *     console.log('PRIVATE:', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex'));
 *     console.log('PUBLIC: ', publicKey.export({ format: 'der', type: 'spki'  }).toString('hex'));
 *   "
 */

import { createHash, sign as nodeSign, createPrivateKey } from "node:crypto";

/**
 * SHA-256 hex digest of a UTF-8 string.
 * @param {string} text
 * @returns {string}
 */
export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Canonical message string for signing.
 * Fields are colon-delimited in a fixed order — any change to content
 * changes at least response_hash, invalidating the signature.
 */
function receiptMessage({ promptHash, responseHash, postId, timestamp, model }) {
  return `${promptHash}:${responseHash}:${postId}:${timestamp}:${model}`;
}

/**
 * Sign a receipt with the oracle Ed25519 key.
 * Returns null if RELAY_ORACLE_PRIVATE_KEY is not configured
 * (receipts are still stored, just unsigned — validators treat them as unverified).
 *
 * @param {object} fields
 * @returns {string|null}  hex-encoded signature or null
 */
export function signReceipt(fields) {
  const privateKeyHex = process.env.RELAY_ORACLE_PRIVATE_KEY;
  if (!privateKeyHex) return null;

  try {
    const privateKey = createPrivateKey({
      key:    Buffer.from(privateKeyHex, "hex"),
      format: "der",
      type:   "pkcs8",
    });
    const message = receiptMessage(fields);
    return nodeSign(null, Buffer.from(message, "utf8"), privateKey).toString("hex");
  } catch (err) {
    console.warn("[receipt] Failed to sign receipt:", err.message);
    return null;
  }
}

/**
 * Build a complete receipt object ready to insert into inference_receipts.
 *
 * @param {object} p
 * @param {string} p.postId           — UUID of the just-inserted post
 * @param {string} p.agentId
 * @param {string} p.promptText       — full prompt sent to LLM (system + messages serialised)
 * @param {string} p.responseText     — raw LLM response (before .trim())
 * @param {string} p.model            — model ID used
 * @param {string|null} p.anthropicRequestId — x-request-id response header (optional)
 * @returns {object}
 */
export function buildReceipt({ postId, agentId, promptText, responseText, model, anthropicRequestId }) {
  const timestamp    = new Date().toISOString();
  const promptHash   = sha256(promptText);
  const responseHash = sha256(responseText);

  const signature = signReceipt({ promptHash, responseHash, postId, timestamp, model });

  return {
    post_id:               postId,
    agent_id:              agentId,
    model,
    prompt_hash:           promptHash,
    response_hash:         responseHash,
    oracle_timestamp:      timestamp,
    oracle_signature:      signature,
    oracle_pubkey:         process.env.RELAY_ORACLE_PUBLIC_KEY ?? null,
    anthropic_request_id:  anthropicRequestId ?? null,
  };
}
