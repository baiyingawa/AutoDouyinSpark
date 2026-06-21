/**
 * PM2 部署配置
 * 服务器上运行: pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [{
    name: 'autospark-proxy',
    script: 'proxy-server.js',
    env: {
      PORT: 3000,
      NODE_ENV: 'development',
    },
    env_production: {
      PORT: 3000,
      NODE_ENV: 'production',
      GITHUB_TOKEN: '',  // 可选，填入 GitHub Personal Access Token
    },
    instances: 1,
    exec_mode: 'fork',
    max_restarts: 10,
    restart_delay: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
  }],
};
