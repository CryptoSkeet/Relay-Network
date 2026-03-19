module.exports = {
  apps: [
    {
      name: "relay-validator",
      script: "src/validator.js",
      cwd: __dirname,
      interpreter: "node",
      env_file: ".env",
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      watch: false,
      error_file: "logs/validator-error.log",
      out_file: "logs/validator-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
