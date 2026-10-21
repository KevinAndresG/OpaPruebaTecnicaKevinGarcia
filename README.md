# Módulo de créditos

API REST para administrar solicitudes de crédito de asociados de una cooperativa, con interfaz web y notificación por webhook cuando se crea un crédito.

- **Backend:** Node.js, Express, TypeScript, SQL Server
- **Frontend:** React, Vite
- **Documentación de decisiones técnicas:** [docs/DECISIONES.md](docs/DECISIONES.md)

```
backend/     API, script SQL (sql/schema.sql) y pruebas
frontend/    aplicación web
docs/        decisiones técnicas, arquitectura y escalabilidad
```

## Ejecución con Docker

Requiere Docker Desktop (en Windows usa WSL 2 y la virtualización activada en la BIOS).

```bash
cp .env.example .env
docker compose up --build
```

Edite `.env` antes del primer arranque: `DB_PASSWORD` necesita mínimo 8 caracteres con mayúscula, minúscula, número y símbolo.

Para dejarlo en segundo plano use `docker compose up --build -d` y consulte el avance con `docker compose logs -f backend` (listo cuando aparece `API lista`).

| Comando | Para qué |
|---|---|
| `docker compose down` | Apagar todo conservando los datos |
| `docker compose up -d` | Volver a encender |
| `docker compose up -d --build backend` | Aplicar cambios de código (también `frontend`) |
| `docker compose logs backend` | Ver los logs de la API |
| `docker compose down -v` | Apagar y borrar los datos |

| Servicio | URL |
|---|---|
| Web | http://localhost:8080 |
| API y Swagger | http://localhost:3000/api/docs |
| SQL Server | `localhost,1433`, usuario `sa`, clave `DB_PASSWORD`, base `OpaCreditos` |

La API crea la base de datos y las tablas al arrancar. Los datos persisten en el volumen `sqldata`; para empezar de cero use `docker compose down -v`.
Las claves del `.env` solo se aplican la primera vez que se crea la base y los usuarios.

## Ejecución sin Docker

Requiere Node 20 o superior y un SQL Server accesible (con autenticación SQL y TCP en el puerto 1433).

```bash
cd backend
cp .env.example .env
npm install
npm run db:init
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

La web queda en http://localhost:5173 y reenvía `/api` al backend.

## Usuarios

Se crean al iniciar la API con las claves definidas en `SEED_ADMIN_PASSWORD` y `SEED_ANALISTA_PASSWORD`.
Desde la pantalla de ingreso («Crear cuenta») se pueden registrar usuarios nuevos, siempre con rol analista.

| Usuario | Permisos |
|---|---|
| `admin` | Todo, incluido eliminar |
| `analista` y cuentas registradas | Crear, consultar, editar y cambiar estado |

## Datos de ejemplo

Con `CARGAR_DATOS_EJEMPLO=true` (valor por defecto en Docker) la API crea 24 créditos en distintos estados al arrancar, solo si hay menos de 20. Para no cargarlos, ponga `CARGAR_DATOS_EJEMPLO=false` en el `.env`.

También se pueden cargar a mano:

```bash
docker compose exec backend node dist/seed.js
```

Sin Docker: `npm run db:seed` dentro de `backend/`.

## Pruebas

```bash
cd backend && npm test
```

```bash
cd frontend && npm test
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Inicio de sesión |
| POST | `/api/auth/registro` | Registro de usuario (rol analista) |
| POST | `/api/creditos` | Crear crédito |
| GET | `/api/creditos` | Listar (`page`, `pageSize`, `estado`, `identificacion`, `q`, `sort`, `order`) |
| GET | `/api/creditos/resumen` | Total y cantidad por estado |
| GET | `/api/creditos/{id}` | Detalle con historial y notificaciones |
| PUT / PATCH | `/api/creditos/{id}` | Actualizar |
| PATCH | `/api/creditos/{id}/estado` | Cambiar estado |
| DELETE | `/api/creditos/{id}` | Borrado lógico (admin) |
| POST | `/api/webhooks/creditos` | Receptor de ejemplo del webhook |
| GET | `/api/health` | Estado del servicio y la base de datos |

## Webhook

Al crear un crédito se envía un `POST` firmado (`X-Signature`, HMAC-SHA256) a `WEBHOOK_URL`. Por defecto apunta al receptor de ejemplo de la propia API.
El estado de cada envío se ve en el detalle del crédito y en la tabla `WebhookEventos`. Los detalles de reintentos y fallos están en [docs/DECISIONES.md](docs/DECISIONES.md).
