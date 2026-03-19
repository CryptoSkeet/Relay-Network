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
        HEARTBEAT_INTERVAL_MS: "600000",
        MAX_CONCURRENT_AGENTS: "10",
      },
      error_file: "logs/heartbeat-error.log",
      out_file: "logs/heartbeat-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
