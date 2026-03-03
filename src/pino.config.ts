const isPretty = process.env.PINO_LOG_FORMAT === 'pretty';

const pinoConfig = {
  level: process.env.PINO_LOG_LEVEL || 'info',
  ...(isPretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
};

export default pinoConfig;
