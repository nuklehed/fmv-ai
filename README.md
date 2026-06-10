# FMV AI — Fair Market Value Assessment Platform

A platform for managing fair market value (FMV) assessments of healthcare professionals (HCPs). Business users submit HCP assessments with CV documents, AI evaluates them against configurable criteria, and administrators review and approve the results.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vue 3 + TypeScript + Vite + Pinia + Vue Router 4+ + Tailwind CSS + PrimeVue |
| **Backend** | Node.js + TypeScript + Express |
| **Database** | PostgreSQL + Prisma ORM |
| **Queue** | BullMQ + Redis (async AI processing) |
| **AI Worker** | Local LLM (Qwen3.6-35B-a3b) via local API |
| **Deployment** | Docker Compose |

## Project Structure

```
fmv-ai/
├── apps/
│   ├── frontend/          # Vue 3 + TypeScript SPA
│   └── backend/           # Express API server + Prisma schema
├── packages/
│   └── shared/            # Shared types (future)
├── docs/adr/              # Architecture Decision Records
├── docker-compose.yml     # Local infrastructure (PostgreSQL, Redis)
└── .github/workflows/ci.yml  # CI pipeline
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Setup

1. **Clone and install dependencies**

   ```bash
   npm install
   ```

2. **Start infrastructure (PostgreSQL + Redis)**

   ```bash
   docker compose up -d
   ```

3. **Configure environment variables**

   ```bash
   cp apps/backend/.env.example apps/backend/.env
   cp apps/frontend/.env.example apps/frontend/.env
   ```

4. **Initialize database and seed data**

   ```bash
   npm run db:push               # Create tables
   npm run db:seed               # Users + basic setup
   npm run db:seed-fmv-tiers     # FMV HCP Tiers criteria set (10 questions, 51 answers)
   npm run db:seed-specialties   # Top 10 specialties + link to criteria set
   npm run db:seed-tiers         # SpecialtyRate entries + tier thresholds
   npm run db:seed-dev-data      # 60 HCPs, 60 assessments, audit trails, notifications
   ```

   Or run all at once:
   ```bash
   npm run db:push && npm run db:seed && npm run db:seed-fmv-tiers && npm run db:seed-specialties && npm run db:seed-tiers && npm run db:seed-dev-data
   ```

5. **Start development servers**

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

## Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| [0001](docs/adr/0001-assessments-as-discrete-events.md) | Assessments as discrete events | ✅ Accepted |
| [0002](docs/adr/0002-async-single-worker-ai-processing.md) | Async single-worker AI processing | ✅ Accepted |
| [0003](docs/adr/0003-logical-multi-tenancy.md) | Logical multi-tenancy | ✅ Accepted |

## Domain Glossary

See [CONTEXT.md](./CONTEXT.md) for comprehensive domain definitions (HCP, Assessment, Criteria Set, Audit Trail, etc.).

## Development

### Frontend

```bash
cd apps/frontend
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run lint       # ESLint
npm run type-check  # TypeScript check
```

### Backend

```bash
cd apps/backend
npm run dev        # Start with tsx watch
npm run build      # Compile to JavaScript
npm run db:generate # Regenerate Prisma client
npm run db:migrate  # Run migrations
npm run db:push     # Push schema to DB (dev only)
```

## License

Private — All rights reserved.
