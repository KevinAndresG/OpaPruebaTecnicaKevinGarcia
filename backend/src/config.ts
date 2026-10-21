try {
  process.loadEnvFile();
} catch {}

const prod = process.env.NODE_ENV === 'production';

function secret(name: string, dev: string) {
  const v = process.env[name];
  if (v) return v;
  if (prod) throw new Error(`Falta la variable ${name}`);
  return dev;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: secret('JWT_SECRET', 'solo-para-desarrollo'),
  jwtExpira: process.env.JWT_EXPIRA ?? '1h',
  webhook: {
    url: process.env.WEBHOOK_URL ?? 'http://localhost:3000/api/webhooks/creditos',
    secret: secret('WEBHOOK_SECRET', 'webhook-dev-secret'),
    timeoutMs: 5000,
    maxIntentos: 5,
    backoff: [30, 120, 600, 3600, 21600],
  },
  seed: {
    adminPassword: secret('SEED_ADMIN_PASSWORD', 'Admin123*'),
    analistaPassword: secret('SEED_ANALISTA_PASSWORD', 'Analista123*'),
    datosEjemplo: process.env.CARGAR_DATOS_EJEMPLO === 'true',
  },
  db: {
    server: process.env.DB_SERVER ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'OpaCreditos',
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: true },
  },
};
