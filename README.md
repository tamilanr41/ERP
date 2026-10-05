# Hospital ERP — MERN

Production-ready Hospital ERP / HIS built on the MERN stack (MongoDB, Express, React, Node.js). Covers registration, OPD/IPD, appointments, pharmacy, lab, billing & payments, reports, users & RBAC, notifications, audit logs, and hospital settings.

## Tech Stack

- **Backend** — Node.js (ESM), Express, Mongoose, JWT (access + refresh), express-validator, winston logging, helmet, express-rate-limit, multer uploads, exceljs/pdfkit broadcast reports.
- **Frontend** — React 18 + Vite, React Router, TanStack Query, Tailwind CSS, recharts, lucide-react.
- **Database** — MongoDB (local or Atlas). `mongodb-memory-server` powers the test suite with no local install required.
- **Monorepo** — npm workspaces (`server/`, `client/`).

## Prerequisites

- Node.js 20+ (tested on Node 24)
- MongoDB (unless you only run the test suite)

## Setup

```bash
npm install          # installs server + client workspaces
cp .env.example .env # then edit secrets / MONGO_URI
```

### Environment variables

See `.env.example` for the full reference. Minimum for local dev:

```env
MONGO_URI=mongodb://127.0.0.1:27017/hospital_erp
JWT_SECRET=<long random string>
JWT_REFRESH_SECRET=<another long random string>
```

## Seed (first run)

Creates the SUPER_ADMIN (and other roles), a hospital, departments, 2 doctors, 10 patients, wards & beds, suppliers, medicines with batches, lab tests, sample appointments and bills.

```bash
npm run seed
```

Demo logins (defaults from `.env`):

| User | Password | Role |
| --- | --- | --- |
| `superadmin` | `Admin@123` (or `SEED_ADMIN_PASSWORD`) | Super Admin |
| `dr.ravi` | `Doctor@123` | Doctor |
| `dr.priya` | `Doctor@123` | Doctor |
| `reception` | `Recep@123` | Receptionist |
| `nurse` | `Nurse@123` | Nurse |
| `pharmacist` | `Pharm@123` | Pharmacist |
| `labtech` | `Lab@123` | Lab Technician |
| `billing` | `Bill@123` | Billing Staff |
| `accountant` | `Acc@123` | Accountant |
| `store` | `Store@123` | Store Manager |

## Run (development)

```bash
npm run dev          # server (:5000) + client (:5173) together
# or separately:
npm run dev:server
npm run dev:client
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:5000`, so the client needs no API URL config in development.

## Tests & Build

```bash
npm test             # backend test suite (11 tests, in-memory MongoDB)
npm run build        # production build of the client (dist/)
npm start            # run the server in production
```

## API

Base path: `/api`. Responses use a consistent envelope:

- Success: `{ success: true, message, data, pagination? }`
- Error: `{ success: false, message, errors? }`

Authenticated endpoints require `Authorization: Bearer <token>`. Login is `POST /api/auth/login` with `{ usernameOrEmail, password }` and returns `{ accessToken, refreshToken, user }`.

Key modules: `/api/auth`, `/api/patients`, `/api/appointments`, `/api/opd`, `/api/ipd`, `/api/pharmacy`, `/api/lab`, `/api/billing`, `/api/reports`, `/api/dashboard`, `/api/users`, `/api/notifications`, `/api/audit`, `/api/masters`.

## Project Layout

```
server/src/
  config/       env + db + logger
  models/       Mongoose models
  services/     business logic (transactions, numbering)
  controllers/  request handlers
  routes/       Express routers (auth-guarded, permission-checked)
  middleware/   auth, RBAC, validation, error handler
  utils/
  seed/seed.js  demo data bootstrap
  tests/        node:test suite + smoke harness
client/src/
  pages/        Dashboard, Patients, Appointments, OPD, IPD, Pharmacy, Lab, Billing, Reports, Users, Notifications, Audit, Settings
  components/   shared UI + route guards
  lib/api.js    axios instance (baseURL /api)
```

## Screenshots

_To be added._