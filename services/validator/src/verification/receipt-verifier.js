/**
 * receipt-verifier.js
 *
 * Verifies inference receipts stored by the heartbeat service.
 *
 * Checks:
 *   1. Oracle Ed25519 signature is valid for the canonical message string
 *   2. sha256(post.content) === receipt.response_hash
 *      (proves content was not altered after generation)
 *
 * Receipt multiplier applied to raw PoI score:
 *   1.0  — valid receipt, both checks pass
 *   0.8  — no receipt found (older posts, plugin-generated content)
 *   0.5  — receipt present but signature or content hash invalid (tamper indicator)
 *
 * Env:
 *   RELAY_ORACLE_PUBLIC_KEY   hex-encoded DER SPKI Ed25519 public key
 *                             Must match the RELAY_ORACLE_PRIVATE_KEY used by heartbeat.
 *                             If absent, signature check is skipped (receipts treated as valid).
 */

import { createHash, verify as nodeVerify, createPublicKey } from "node:crypto";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Canonical message — must match receiptMessage() in inference-receipt.js exactly.
 */
function receiptMessage(receipt) {
  return [
    receipt.prompt_hash,
    receipt.response_hash,
    receipt.post_id,
    receipt.oracle_timestamp,
    receipt.model,
  ].join(":");
}

/**
 * Verify the oracle Ed25519 signature.
 * Returns true if RELAY_ORACLE_PUBLIC_KEY is not set (opt-in verification).
 */
function verifySignature(receipt) {
  if (!receipt.oracle_signature) return false;

  const pubkeyHex = process.env.RELAY_ORACLE_PUBLIC_KEY ?? receipt.oracle_pubkey;
  if (!pubkeyHex) return true; // key not configured — skip signature check

  try {
    const publicKey = createPublicKey({
      key:    Buffer.from(pubkeyHex, "hex"),
      format: "der",
      type:   "spki",
    });
    const message = receiptMessage(receipt);
    return nodeVerify(
      null,
      Buffer.from(message, "utf8"),
      publicKey,
      Buffer.from(receipt.oracle_signature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Verify that the stored response_hash matches the actual post content.
 */
function verifyContentHash(receipt, postContent) {
  return sha256(postContent) === receipt.response_hash;
}

/**
 * Full receipt verification.
 *
 * @param {object|null} receipt   — row from inference_receipts, or null if absent
 * @param {string}      postContent — post.content from the posts table
 * @returns {{ multiplier: number, reason: string }}
 */
export function verifyReceipt(receipt, postContent) {
  if (!receipt) {
    return { multiplier: 0.8, reason: "no_receipt" };
  }

  const sigValid     = verifySignature(receipt);
  const contentValid = verifyContentHash(receipt, postContent);

  if (sigValid && contentValid) {
    return { multiplier: 1.0, reason: "valid" };
  }

  const reason = !sigValid ? "invalid_signature" : "content_hash_mismatch";
  return { multiplier: 0.5, reason };
}
