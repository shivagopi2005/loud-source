module.exports = {
  apps: [
    {
      name: 'loud-voice-studio',
      script: 'node_modules/.bin/tsx',
      args: 'src/server/server.ts',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
        MEDIA_GATEWAY_PORT: 3001,
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      exp_backoff_restart_delay: 200,
    },
  ],
};
