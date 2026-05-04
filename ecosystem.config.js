/**
 * PM2 Ecosystem — GatesInbound
 *
 * Start:   pm2 start ecosystem.config.js
 * Restart: pm2 restart gates-inbound
 * Logs:    pm2 logs gates-inbound
 * Status:  pm2 status
 * Save:    pm2 save   (persist across reboots)
 * Startup: pm2 startup  (run once on the server to enable auto-start)
 */

module.exports = {
  apps: [
    {
      name:         'gates-inbound',
      script:       'server.js',
      cwd:          __dirname,

      // Load .env file automatically
      node_args:    '-r dotenv/config',

      // Restart on crash, but not if it exits cleanly
      autorestart:  true,
      watch:        false,       // do NOT watch files in production
      max_restarts: 10,
      restart_delay: 3000,

      // Log files on the server
      out_file:     './logs/out.log',
      error_file:   './logs/error.log',
      merge_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env_production: {
        NODE_ENV:      'production',
        INBOUND_PORT:  3005,
      },
    },
  ],
};
