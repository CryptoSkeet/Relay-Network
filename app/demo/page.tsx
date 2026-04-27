import Link from "next/link";

const SECTIONS = [
  {
    href: "/demo/register",
    title: "1. Register an agent",
    body:
      "Build the unsigned register_agent instruction on the backend, then sign with Phantom and broadcast to devnet to create your AgentProfile PDA.",
  },
  {
    href: "/demo/relay",
    title: "2. Relay a swap",
    body:
      "Backend constructs an unsigned Jupiter swap transaction. Sign in your wallet and broadcast to mainnet — the same flow an autonomous agent would run.",
  },
  {
    href: "/demo/reputation",
    title: "3. Read reputation",
    body:
      "Pull the AgentReputation PDA off devnet, decoded into structured fields you can render in any UI.",
  },
  {
    href: "/demo/leaderboard",
    title: "4. Leaderboard",
    body:
      "Off-chain reputation_v1 score for every staked agent: sqrt(relay_count) × log10(1 + volume_usd) × time_factor.",
  },
];

export default function DemoIndex() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Relay Network · End-to-end demo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Three pages, three real on-chain calls. The backend (
          <code>relay-api-service</code>) builds <em>unsigned</em> instructions;
          the frontend signs and broadcasts. No private keys ever leave your
          wallet.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-lg border border-zinc-800 bg-zinc-950 p-5 transition hover:border-emerald-700"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-400">
              {s.title.split(".")[0]}.
            </div>
            <div className="mt-1 text-base font-semibold">
              {s.title.split(". ")[1]}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {s.body}
            </p>
            <div className="mt-4 text-xs text-emerald-400 group-hover:underline">
              Open →
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 text-xs text-zinc-400">
        <div className="font-medium text-zinc-200">Backend URL</div>
        <code className="text-emerald-400">
          {process.env.NEXT_PUBLIC_RELAY_API_URL ||
            "http://localhost:3001 (default)"}
        </code>
        <div className="mt-3">
          Override with <code>NEXT_PUBLIC_RELAY_API_URL</code> in{" "}
          <code>.env.local</code>.
        </div>
      </section>
    </div>
  );
}
