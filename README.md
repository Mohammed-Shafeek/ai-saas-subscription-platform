# AI-Enabled SaaS Subscription & Analytics Platform

A robust, production-ready SaaS subscription backend built with Node.js, Express, PostgreSQL, Sequelize ORM, Stripe (test mode), Redis, BullMQ, PDFKit, and the Model Context Protocol (MCP) SDK.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture and Request Flow](#3-architecture-and-request-flow)
4. [Prerequisites](#4-prerequisites)
5. [Installation Steps](#5-installation-steps)
6. [Environment Setup](#6-environment-setup)
7. [Docker Compose Commands](#7-docker-compose-commands)
8. [Database Migration and Seed Commands](#8-database-migration-and-seed-commands)
9. [How to Start the API](#9-how-to-start-the-api)
10. [How to Start the Background Worker](#10-how-to-start-the-background-worker)
11. [How to Configure Stripe Webhook Testing](#11-how-to-configure-stripe-webhook-testing)
12. [How to Test Email Using Mailtrap](#12-how-to-test-email-using-mailtrap)
13. [How to Connect the MCP Server to Claude Desktop](#13-how-to-connect-the-mcp-server-to-claude-desktop)
14. [API Endpoint Documentation](#14-api-endpoint-documentation)
15. [Testing Instructions](#15-testing-instructions)

---

## 1. Project Overview
This platform provides end-to-end subscription lifecycle management and real-time revenue analytics for an AI SaaS business:
- **Subscription Checkout**: Creates validated Stripe Checkout sessions using configured plans.
- **Webhook Processing**: Cryptographically verifies incoming Stripe events, preventing duplicate executions with database idempotency logs, and activates subscriptions only upon verified payment.
- **PDF Invoice & Email Delivery**: Automatically renders tax invoices via PDFKit and delivers them via Nodemailer to Mailtrap.
- **Expiration & Renewal Reminders**: A scheduled daily cron detects expiring subscriptions within a 3-day window and dispatches background reminder jobs to BullMQ workers with exponential backoff retries.
- **Redis Analytics Caching**: Read-through caching (60s TTL) for active subscriber counts and multi-currency revenue metrics, invalidated automatically on lifecycle events.
- **Model Context Protocol (MCP) Server**: Provides an AI-accessible interface for tools like Claude Desktop to safely query platform analytics without unrestricted database access.

---

## 2. Technology Stack
- **Runtime**: Node.js (CommonJS, `>= 18.x`)
- **Web Framework**: Express.js 5
- **Primary Database**: PostgreSQL 16
- **ORM**: Sequelize ORM 6
- **Payment Gateway**: Stripe SDK (Test Mode)
- **Cache & Message Broker**: Redis 7
- **Job Queue**: BullMQ 6
- **Scheduled Tasks**: node-cron 4
- **Email Service**: Nodemailer with Mailtrap
- **Document Generation**: PDFKit
- **AI Agent Integration**: Official `@modelcontextprotocol/sdk`
- **Containerization**: Docker & Docker Compose
- **Testing**: Jest 30, Supertest 7, ioredis-mock 8

---

## 3. Architecture and Request Flow

### Directory Structure
```
c:\Interview task\
├── docker-compose.yml       # PostgreSQL 16 & Redis 7 container definition
├── package.json             # CommonJS dependencies, scripts, and metadata
├── .env.example             # Environment configuration template
├── storage/
│   └── invoices/            # Generated PDF invoice storage
├── src/
│   ├── config/              # Database, Redis, Stripe, and Email configuration
│   ├── models/              # Sequelize models (User, Plan, Subscription, Payment, Invoice, WebhookEvent)
│   ├── controllers/         # Express controllers (thin request handlers)
│   ├── routes/              # Route definitions & router aggregation
│   ├── services/            # Core business logic (Stripe, Webhook, Invoice, Email, Cache, Analytics)
│   ├── middlewares/         # Central error handling, auth, and input validation
│   ├── queues/              # BullMQ queue configurations
│   ├── jobs/                # Daily cron job and background worker processes
│   ├── mcp/                 # Model Context Protocol (MCP) server & tools
│   ├── scripts/             # Database migration and seeder scripts
│   ├── app.js               # Express application configuration
│   └── server.js            # HTTP API server entrypoint
└── tests/                   # Comprehensive Jest test suites (Phases 1 through 8)
```

### Request Flow
```
[Client / Frontend]
        │
        ▼ (POST /api/checkout/create-session)
[Express Router] ──► [Input Validation] ──► [Stripe Service] ──► [Stripe API]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
│ Customer completes payment in Stripe Test Mode
▼
[Stripe Webhook] ──► [POST /api/webhooks/stripe]
        │
        ▼ (HMAC-SHA256 signature verification via rawBody)
[Webhook Service]
        ├── 1. Check idempotency in WebhookEvent table (prevents double charges)
        ├── 2. Atomic Transaction:
        │       ├── Record WebhookEvent
        │       ├── Activate Subscription record
        │       └── Create Payment record
        ├── 3. Trigger InvoiceService (generates PDFKit invoice to storage/invoices/)
        ├── 4. Trigger EmailService (sends Mailtrap email with attached invoice)
        └── 5. Invalidate Redis analytics cache

[Daily Cron Job (0 9 * * *)]
        │
        ▼ (Scans subscriptions expiring within 3 days)
[Redis Deduplication Key Check] ──► [BullMQ Queue (subscription-reminders)]
                                                    │
                                                    ▼
                                    [Background Worker Process]
                                                    │
                                                    ▼
                                    [Nodemailer / Mailtrap Reminder Email]
```

---

## 4. Prerequisites
- **Node.js**: Version 18.x or higher (`node -v`)
- **npm**: Version 9.x or higher (`npm -v`)
- **Docker & Docker Compose**: Optional for local execution; required if running PostgreSQL and Redis via containers.
- **Stripe Account**: Free test account at [stripe.com](https://stripe.com)
- **Mailtrap Account**: Free sandbox inbox at [mailtrap.io](https://mailtrap.io)

---

## 5. Installation Steps
1. Clone or navigate to the repository directory:
   ```bash
   cd "c:\Interview task"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## 6. Environment Setup
1. Copy the example configuration to create your active `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with your preferred credentials:
   ```env
   # Server
   PORT=3000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000

   # Database (PostgreSQL)
   DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/saas_platform
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=saas_platform
   DB_USER=postgres
   DB_PASSWORD=postgrespassword
   DB_LOGGING=false

   # Redis
   REDIS_URL=redis://localhost:6379
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Stripe (Test Mode)
   STRIPE_SECRET_KEY=sk_test_your_stripe_test_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_signing_secret

   # Nodemailer / Mailtrap
   SMTP_HOST=sandbox.smtp.mailtrap.io
   SMTP_PORT=2525
   SMTP_USER=your_mailtrap_user
   SMTP_PASS=your_mailtrap_password
   EMAIL_FROM=no-reply@saasplatform.local

   # Jobs
   REMINDER_CRON_SCHEDULE=0 9 * * *
   ```

---

## 7. Docker Compose Commands
To run PostgreSQL 16 and Redis 7 in isolated containers with healthchecks and persistent volumes:

- **Start containers in background**:
  ```bash
  docker compose up -d
  ```
- **Check container health**:
  ```bash
  docker compose ps
  ```
- **View container logs**:
  ```bash
  docker compose logs -f
  ```
- **Stop containers**:
  ```bash
  docker compose down
  ```

---

## 8. Database Migration and Seed Commands
Ensure your PostgreSQL database is running (via Docker or local service), then run:

1. **Run migrations (synchronize models and constraints)**:
   ```bash
   npm run db:migrate
   ```
2. **Seed initial SaaS plans, sample user, active subscription, and demo payment**:
   ```bash
   npm run db:seed
   ```
   *Seeded Plans:*
   - **Starter Plan**: $19.00 / month (100 AI credits)
   - **Pro Plan**: $49.00 / month (1,000 AI credits)
   - **Enterprise Plan**: $199.00 / month (unlimited AI credits)

---

## 9. How to Start the API
Start the Express API server:

- **Production / Standard Mode**:
  ```bash
  npm start
  ```
- **Development Mode with auto-reloading**:
  ```bash
  npm run dev
  ```
The server will boot on `http://localhost:3000` (or your configured `PORT`).

---

## 10. How to Start and Verify Background Jobs

### Architecture
- **Cron Scheduler (`src/jobs/reminder.cron.js`)**: Runs once daily (default: 9:00 AM, `0 9 * * *`). Queries active subscriptions whose `endDate` falls within the next 3 days (`[Op.between]: [now, now + 3 days]`).
- **Deduplication Guard**: Checks Redis key `reminder:sent:<subId>:<expiryDate>` (with a 7-day TTL) and assigns a deterministic BullMQ `jobId` (`reminder-<subId>-<expiryDate>`) to guarantee the user is never reminded twice for the same billing cycle.
- **Queue (`src/queues/reminder.queue.js`)**: BullMQ queue named `subscription-reminders` with 3 retry attempts and exponential backoff (`delay: 2000ms`).
- **Worker (`src/jobs/reminder.worker.js`)**: Consumes jobs, formats renewal reminder templates, and dispatches emails via Nodemailer/Mailtrap.

### Starting the Services
- **Start the Worker**:
  ```bash
  npm run worker
  ```
- **Start the Cron Scheduler**:
  ```bash
  npm run cron
  ```
- **Or Run Everything Together**:
  ```bash
  npm run all
  ```

### Verifying Background Jobs
1. **Automated Unit & Integration Verification**:
   Run the dedicated test suite:
   ```bash
   npx jest tests/phase5-cron-worker.test.js
   ```
   This validates:
   - Detecting subscriptions expiring within the 3-day window.
   - Ignoring subscriptions expiring beyond 3 days or canceled.
   - Deduplication in Redis preventing repeated job enqueuing.
   - Worker processing and exponential retry behavior.

2. **Manual Live Verification**:
   - Seed the database with `npm run db:seed`.
   - Update a subscription's `endDate` in the database to 2 days from now.
   - Run `node -e "require('./src/jobs/reminder.cron').checkExpiringSubscriptions()"` to trigger an immediate scan.
   - Observe the worker terminal logs:
     ```text
     [Cron] Found 1 expiring subscription(s).
     [Cron] Enqueued reminder job for subscription <id> (2 days remaining).
     [Worker] Processing reminder job for subscription <id>...
     [Worker] Successfully delivered renewal reminder to <email>.
     ```
   - Check your Mailtrap inbox to view the delivered renewal reminder email.

---

## 11. How to Configure Stripe Webhook Testing
1. Install the official [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Authenticate the CLI with your Stripe test account:
   ```bash
   stripe login
   ```
3. Forward webhook events to your local API server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the webhook signing secret displayed in the CLI output (starts with `whsec_...`) and update `STRIPE_WEBHOOK_SECRET` in your `.env` file.
5. Trigger a mock checkout session event to verify end-to-end receipt:
   ```bash
   stripe trigger checkout.session.completed
   ```

---

## 12. How to Test Email Using Mailtrap
1. Log in to [Mailtrap](https://mailtrap.io).
2. Navigate to **Email Testing** > **Inboxes** > Select your sandbox inbox.
3. Under **Show Credentials**, select **Nodemailer** from the dropdown.
4. Copy `host`, `port`, `user`, and `pass` into your `.env` file under `SMTP_*`.
5. Run the Phase 4 test suite or trigger a Stripe checkout:
   - Within seconds, check your Mailtrap web inbox.
   - You will see the HTML email with the attached PDF invoice (`INV-YYYYMMDD-XXXX.pdf`).

---

## 13. How to Connect the MCP Server to Claude Desktop
The Model Context Protocol (MCP) server provides Claude Desktop with direct, safe access to real-time subscription and revenue analytics.

### Configuration
1. Open Claude Desktop's configuration file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add the `saas-analytics` server under `mcpServers`:
   ```json
   {
     "mcpServers": {
       "saas-analytics": {
         "command": "node",
         "args": [
           "c:\\Interview task\\src\\mcp\\index.js"
         ],
         "env": {
           "NODE_ENV": "development",
           "DATABASE_URL": "postgresql://postgres:postgrespassword@localhost:5432/saas_platform",
           "REDIS_URL": "redis://localhost:6379"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop.
4. Ask Claude in natural language:
   - *"How many active subscribers do we have on the platform?"* (Claude invokes `get_active_subscribers`)
   - *"What is our total revenue broken down by currency?"* (Claude invokes `get_total_revenue`)

---

## 14. API Endpoint Documentation

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | System uptime, database, and Redis health status |
| `POST` | `/api/checkout/create-session` | None | Generates a Stripe Checkout session URL |
| `POST` | `/api/webhooks/stripe` | Signature | Verifies & processes Stripe events (`rawBody` HMAC) |
| `GET` | `/api/subscriptions` | Required | Lists all subscriptions for the authenticated user |
| `GET` | `/api/subscriptions/:id` | Required | Gets subscription details by ID (owner only) |
| `GET` | `/api/invoices/:id` | Required | Gets invoice metadata or downloads PDF (`?download=true`) |
| `GET` | `/api/analytics/active-subscribers` | Required | Returns active subscriber count (Redis-cached, 60s TTL) |
| `GET` | `/api/analytics/total-revenue` | Required | Returns multi-currency revenue (supports `?currency=usd`) |

### Authentication Header
Protected endpoints require:
```http
x-user-id: <user-uuid>
```
or
```http
Authorization: Bearer <user-uuid>
```

---

## 15. Testing Instructions
The test suite includes 8 comprehensive Jest test files covering all requirements:

```bash
# Run the complete test suite
npm test
```

### Test Suites Overview:
1. `tests/phase1-config.test.js`: Validates project layout, Redis settings, Stripe initialization, and environment configuration.
2. `tests/phase2-models.test.js`: Tests database models, unique constraints, UUIDs, relations, and transactional rollbacks.
3. `tests/phase3-stripe.test.js`: Tests input validation, checkout creation, webhook HMAC verification, and duplicate prevention.
4. `tests/phase4-invoices-email.test.js`: Tests PDF invoice rendering, idempotency, email dispatch, and download streaming.
5. `tests/phase5-cron-worker.test.js`: Tests 3-day expiration detection, Redis deduplication key logic, and worker retry behavior.
6. `tests/phase6-analytics-cache.test.js`: Tests 60s read-through cache, currency separation (USD vs EUR), and cache invalidation.
7. `tests/phase7-mcp.test.js`: Tests MCP tool discovery, least-privilege tool execution, and client-server in-memory transport.
8. `tests/phase8-e2e.test.js`: Validates the full customer lifecycle end-to-end.

