"use client";

import { usePhantom } from "./phantom";

export function ConnectWalletButton() {
  const { pubkey, connect, disconnect, connecting, error, isInstalled } =
    usePhantom();

  if (!isInstalled) {
    return (
      <a
        href="https://phantom.app/download"
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
      >
        Install Phantom ↗
      </a>
    );
  }

  if (pubkey) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <code className="rounded bg-zinc-900 px-2 py-1 text-zinc-300">
          {pubkey.slice(0, 4)}…{pubkey.slice(-4)}
        </code>
        <button
          onClick={disconnect}
          className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-zinc-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect Phantom"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
