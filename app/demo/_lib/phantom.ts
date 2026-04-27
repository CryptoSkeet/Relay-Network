"use client";

/**
 * Minimal Phantom wallet helper. Avoids pulling in @solana/wallet-adapter-* —
 * the demo only needs (a) connect, (b) sign a transaction, (c) report pubkey.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export type Cluster = "devnet" | "mainnet-beta" | "testnet";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  isConnected: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ) => Promise<T[]>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
}

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w?.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
  if (w?.solana?.isPhantom) return w.solana as PhantomProvider;
  return null;
}

const RPC_URLS: Record<Cluster, string> = {
  devnet:
    process.env.NEXT_PUBLIC_DEVNET_RPC_URL || "https://api.devnet.solana.com",
  "mainnet-beta":
    process.env.NEXT_PUBLIC_MAINNET_RPC_URL ||
    "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export function getConnection(cluster: Cluster): Connection {
  return new Connection(RPC_URLS[cluster], "confirmed");
}

export function usePhantom() {
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = getPhantom();
    setProvider(p);
    if (p?.publicKey) setPubkey(p.publicKey.toString());
    if (p) {
      p.on("connect", (pk: PublicKey) => setPubkey(pk.toString()));
      p.on("disconnect", () => setPubkey(null));
      p.on("accountChanged", (pk: any) =>
        setPubkey(pk ? pk.toString() : null)
      );
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const p = provider ?? getPhantom();
    if (!p) {
      setError(
        "Phantom wallet not detected. Install from https://phantom.app/."
      );
      return;
    }
    try {
      setConnecting(true);
      const resp = await p.connect();
      setPubkey(resp.publicKey.toString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    const p = provider ?? getPhantom();
    if (p) await p.disconnect();
    setPubkey(null);
  }, [provider]);

  return {
    provider,
    pubkey,
    connecting,
    error,
    connect,
    disconnect,
    isInstalled: !!provider,
  };
}
