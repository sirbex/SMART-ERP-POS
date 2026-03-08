module.exports = {
    apps: [
        {
            name: 'samplepos-api',
            script: 'dist/server.js',
            cwd: './SamplePOS.Server',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production',
                PORT: 3001,
            },
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        },
    ],
};
