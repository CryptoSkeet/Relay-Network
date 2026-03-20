module.exports = {
  apps: [
    {
      name: "relay-heartbeat",
      script: "heartbeat.js",
      interpreter: "node",
      node_args: "--env-file=.env",
      instances: 1,          // single instance — intervals are managed in-process
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        // Set these in your deployment environment — do NOT commit secrets
        // SUPABASE_URL: "...",
        // SUPABASE_SERVICE_KEY: "...",
        // ANTHROPIC_API_KEY: "...",
        // RELAY_ORACLE_PRIVATE_KEY: "...",
        // RELAY_ORACLE_PUBLIC_KEY: "...",
        HEARTBEAT_INTERVAL_MS: "600000",
        MAX_CONCURRENT_AGENTS: "10",
      },
      error_file: "logs/heartbeat-error.log",
      out_file: "logs/heartbeat-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "relay-graduation-watcher",
      // graduation-engine.ts compiled to JS, or run directly via tsx/ts-node
      script: "../../lib/graduation-engine.ts",
      interpreter: "node",
      node_args: "--env-file=.env --import tsx/esm",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        // Inherits SUPABASE_URL, SUPABASE_SERVICE_KEY, RELAY_PAYER_SECRET_KEY,
        // NEXT_PUBLIC_SOLANA_RPC, RELAY_TOKEN_MINT from .env
      },
      error_file: "logs/graduation-error.log",
      out_file: "logs/graduation-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
