# Day +3 Deployment Checklist: Escrow Seed Fix

**Ready for local build, deploy, and devnet smoke test.**

---

## Step 1: Build Anchor Program

```bash
cd programs/relay_agent_registry
anchor build --program-name relay_agent_registry
```

**Expected:**
- No compiler errors
- `target/deploy/relay_agent_registry.so` created
- Program ID: `Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE` (no change)

**If compile fails:**
- Verify `Cargo.toml` has `sha2 = "0.10.8"`
- Check `use sha2::{Sha256, Digest};` import at top of `lib.rs`

---

## Step 2: Regenerate IDL

```bash
anchor idl init --provider.cluster devnet
```

Or if already exists:
```bash
anchor idl sync --provider.cluster devnet
```

**Expected:**
- IDL updated in `idl/relay_agent_registry.json`
- Account discriminators unchanged (bytecode content changed, not structure)

---

## Step 3: Regenerate TypeScript Client (optional)

If using Codama or `anchor build --program-name relay_agent_registry`:
```bash
# Your codegen command here
# (e.g., codama or anchor-ts-sdk)
```

**Expected:**
- TS types regenerated to match new IDL
- No breaking changes to function signatures

---

## Step 4: Deploy to Devnet

```bash
anchor deploy --program-name relay_agent_registry --provider.cluster devnet
```

**Expected:**
- Deployment signature printed
- Program upgraded to devnet
- Old escrow PDAs incompatible (different seeds), new contracts use new derivation

**Note:** Existing escrow PDAs on devnet may be orphaned (old seed derivation).
If needed, document in deployment notes.

---

## Step 5: Devnet Smoke Test

**Create a fresh contract with UUID and verify escrow flow:**

```bash
# Create a new contract via your API
# For example: POST /contracts { seller: ..., buyer: ..., ... }
# This returns contract_id (a UUID)

# Lock escrow
npx ts-node scripts/smoke-escrow-lock.ts <contractId>

# Check vault PDA on Solscan
# https://solscan.io/account/<vault-pda-address>?cluster=devnet
# Should show RELAY token balance > 0

# Release escrow
npx ts-node scripts/smoke-escrow-release.ts <contractId>

# Verify seller ATA received RELAY
# https://solscan.io/account/<seller-ata>?cluster=devnet
```

**Headline proof:** Solscan link showing escrow vault holding RELAY for first time in protocol.

---

## Step 6: Validation

- [ ] Build succeeds (no Rust compiler errors)
- [ ] IDL regenerated (if applicable)
- [ ] Program deployed to devnet (tx signature recorded)
- [ ] Lock escrow: UUID contract → vault PDA created with RELAY
- [ ] Release escrow: vault PDA → seller ATA transfer succeeds
- [ ] Solscan verification: vault PDA shows RELAY balance before release

---

## Step 7: Commit

```bash
git add .
git commit -m "Day +3: Fix escrow seed length bug via contract_id hashing

- Hash contract_id (UUID) to 32 bytes (SHA-256) in Rust program
- Updated 6 PDA seed declarations + 2 runtime seed constructions
- TS client mirrors hash in deriveEscrowPDA/deriveEscrowVaultPDA
- Solana seed limit (32 bytes) now respected; UUIDs fully supported
- Deployed and verified on devnet: vault PDA holding RELAY
- See OUTPUTS/DAY_3_SUMMARY.md for detailed changes"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `error: sha2 crate not found` | Run `cargo update` in programs dir; verify Cargo.toml includes sha2 |
| `program transaction failed: custom program error: 0x0` | Program panicked; check Solscan logs for stack trace |
| `EscrowNotFoundError` on release/refund | Verify contract_id matches; both TS and Rust must use same hash |
| Vault PDA balance incorrect | Check sender's RELAY balance; ensure mint is correct |

---

## Notes

- All code changes are backward compatible (function signatures unchanged)
- Existing non-UUID contracts unaffected
- UUID contracts now fully supported (were previously unreachable)
- No DB changes required (all on-chain escrow program)

---

## Success Criteria

✅ **Program builds without error**
✅ **Devnet deployment successful**
✅ **UUID contract locked into escrow vault**
✅ **RELAY visible on Solscan in vault PDA**
✅ **Release/refund transfers succeed**
