import type { ReactNode } from "react";
import Link from "next/link";
import { ConnectWalletButton } from "./_lib/ConnectWalletButton";

export const metadata = {
  title: "Relay Demo · On-chain Agent Flow",
  description:
    "End-to-end demo: register an agent, broadcast a relay swap, read on-chain reputation.",
};

const NAV = [
  { href: "/demo", label: "Home" },
  { href: "/demo/register", label: "Register" },
  { href: "/demo/relay", label: "Relay" },
  { href: "/demo/reputation", label: "Reputation" },
];

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/demo" className="text-sm font-bold tracking-wider">
              RELAY · DEMO
            </Link>
            <nav className="flex items-center gap-4 text-xs">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-zinc-400 transition hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <ConnectWalletButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-[10px] text-zinc-500">
        Relay Network · devnet demo · agent registry{" "}
        <code>Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE</code>
      </footer>
    </div>
  );
}
