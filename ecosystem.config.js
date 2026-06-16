// PM2 process config for 5S Daily (Ubuntu homelab).
// Usage (staging — NOT run in this phase):
//   npm ci && npm run build
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//
// Reads secrets from the environment / .env.local on the host — none are
// committed here.
module.exports = {
  apps: [
    {
      name: "5s-daily",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      // Single instance is fine for internal load; switch to "max"/cluster later
      // if needed. Next.js standalone server is not multi-process safe by default.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
