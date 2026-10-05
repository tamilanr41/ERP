# ZhanX HospitalOS — Master Architecture

Brand: **ZhanX HospitalOS** · "Clinical Command Center" design · Enterprise MERN HIS
Build target: production-grade multi-hospital Hospital Operating System (112-point master spec).

> This document maps the **existing** implementation (verified, tested) to the master spec and defines the
> gated roadmap to full coverage. It is the source of truth for module dependencies, API contracts, and phases.

---

## 1. Current State Assessment (baseline)

Verified foundation already in repo `D:\TAMILAN\ERP`:

| Capability | Status |
| --- | --- |
| MongoDB + Mongoose (38 collections) | ✅ done |
| REST API (`/api`, 17 route modules), JWT access+refresh | ✅ done (needs `/api/v1` + error codes) |
| RBAC: permissions per module+action, backend-enforced (`requirePermission`) | ✅ done |
| 17 roles seeded (matches spec) | ✅ done |
| Patients (UHID, dup detection, timeline), merge flag | ✅ done (merge itself ▢) |
| Appointments engine + token/queue skeleton | ✅ done (queue UI/real-time ▢) |
| Live queue board (`GET /api/v1/queue/board`, grouped by doctor, status buckets, wait-time, flag/permission gated, client auto-refresh 10s) | ✅ done (Socket.IO real-time ▢) |
| OPD workflow (vitals, consultation, diagnosis, Rx) | ✅ done |
| IPD (admit/transfer/discharge, bed assignment txn, bed map API) | ✅ done (bed map API + live bed map ▢) |
| Bed Command Center (`GET /api/v1/ipd/beds/command-center` — ward groups, per-bed patient+admission, occupancy stats; client auto-refresh 15s) | ✅ done (live bed map realtime ▢) |
| Pharmacy (FEFO, batch, purchase/sale txn, POS) | ✅ done (POS polish ▢) |
| Lab orders (LIS basics, sample statuses, results, verify, critical alerts) | ✅ done (alert routing ▢) |
| Radiology orders | ✅ done (report workflow, PACS adapter ▢) |
| Billing + payments + refunds + ledger + outstanding; invoice prefixes | ✅ done |
| Cashier closing (`/api/v1/cashier` — shifts OPEN/CLOSED, CSH- numbering, opening/counted cash, expected vs variance, live by-mode collection totals, flag+permission gated; client auto-verify) | ✅ done |
| Insurance / TPA (`/api/v1/insurance` — companies, policies, pre-auth PENDING→APPROVED|PARTIAL|REJECTED, claims DRAFT→SUBMITTED→APPROVED|PARTIAL|REJECTED→SETTLED, patient responsibility, INSURANCE_VIEW/CREATE/MANAGE/PREAUTH/SETTLE perms + flag, client wallpaper board) | ✅ done |
| Dashboard (admin/doctor/pharmacist/lab role-scoped), analytics chart APIs | ✅ done |
| Reports: list + data + CSV/XLSX/PDF export engine | ✅ done (print templates ▢) |
| Notifications + audit logs + settings/hospital master | ✅ done |
| Transactions for sale/refund/admit/discharge; immutable financial record pattern | ✅ done |
| Numbering engine (concurrency-safe counters) | ✅ done |
| Unit tests (11) + full-lifecycle smoke harness | ✅ done |
| React client: 16 lazy pages, Tailwind design system, command-style nav | ✅ done (spec design upgrade ▢) |

**Known gaps vs 112-spec** (expanded below): `/api/v1` versioning + OpenAPI, patient portal, telemedicine,
blood bank module depth, OT calendar, HR/attendance/payroll, assets, housekeeping, dietary, ambulance,
mortuary, procurement/PO/GRN, ICU module, eMAR, real-time
(Socket.IO), workflow/rule/approval engines, SaaS/subscriptions + super-admin console, AI provider
abstraction, search abstraction, feature flags, idempotency keys, docs/OCR pipeline.

---

## 2. Module Dependency Map

Directed dependency (module depends on solid modules below it):

```
                            ┌─────────────────────────────┐
                            │  MANAGEMENT COMMAND CENTER   │  aggregates analytics + alerts
                            └─────────────────────────────┘
        ┌──────────────────────────┬──────────────────────────┐
        ▼                          ▼                          ▼
 ┌─────────────────┐      ┌─────────────────┐        ┌─────────────────┐
 │  BILLING ENGINE  │      │  PATIENT 360 /  │        │  DASHBOARDS /   │
 │  + LEDGER + PAY  │─────▶│  TIMELINE       │◀───────│  ANALYTICS      │
 └─────────────────┘      └─────────────────┘        └─────────────────┘
        ▲                          ▲                          ▲
 ┌──────┴──────┐          ┌────────┴────────┐        ┌────────┴────────┐
 │ PHARMACY    │          │ OPD / EMERGENCY │        │ LAB / RAD/ OT   │
 │ INVENTORY   │◀────────▶│ IPD / NURSING   │        │ BLOOD BANK      │
 │ SUPPLIERS   │          │ ICU / BED MAP   │        │ (orders→results)│
 └─────────────┘          └─────────────────┘        └─────────────────┘
        ▲                          ▲                          ▲
 ┌──────┴──────────────────────────┴─────────────┬────────────┴────────┐
 │  FRONT OFFICE: REGISTRATION · APPOINTMENT ·   │  HR / ASSETS /      │
 │  QUEUE · TOKEN · REFERRAL                     │  MAINTENANCE        │
 └───────────────────────────────────────────────┴─────────────────────┘
        ▲
 ┌──────┴──────────────────────────────────────┐
 │  AUTH · RBAC · TENANCY · AUDIT · MASTER DATA │
 │  NUMBERING · SETTINGS · NOTIFICATIONS · JOBS │
 └─────────────────────────────────────────────┘
```

Key connectivity rules:
- **Patient is the spine.** OPD/IPD/Emergency/Pharmacy/Lab/Radiology/Billing all reference `patientId` and write to the patient timeline.
- **Billing is the sink.** Sale, lab order, surgery, room charge, OT/ICU → bill line items. Payments → ledger. Never compute money from UI state.
- **Inventory/FEFO** serves pharmacy requirePharmacyy sale and OT/ICU consumables.
- **Admission owns a bed** in one transaction; discharge releases it and finalizes billing.
- **Clinical data (Rx, lab results, vitals) is append-only+verifiable**, never silently mutated.

---

## 3. Data Architecture

### 3.1 Tenancy hierarchy (multi-tenant ready)
```
Organization → Hospital → Branch → Building → Floor → Department → Unit → Room → Bed
```
- Temporal tenant keys on every tenant-scoped collection: `organizationId`, `hospitalId`, `branchId`.
- Indexes: `{hospitalId:1, branchId:1, createdAt:-1}`, plus read-role filters in middleware.
- SaaS suspension = `status: SUSPENDED` + grace window; **never delete data on plan lapse**.

### 3.2 Collection families (existing ✅ / planned ▢)
- **Identity**: users, roles, permissions, employees ▢(attendance/payroll), doctors ✅
- **Facility**: hospitals, branches, departments, wards/beds ✅; rooms/building/floor ▢
- **Patient**: patients, patientDocuments ✅, patientContacts ▢, discharges.io summaries ✅, follow-ups ▢
- **Front office**: appointments ✅, queues ▢, referrals ▢
- **Clinical**: opdVisits ✅, clinicalNotes ▢, diagnoses ▢, vitals ▢, prescriptions ✅, medicationChart ▢→eMAR, emergencyVisits ✅, icuRecords ▢, nursingNotes ✅
- **Investigations**: labTests ✅, labOrders ✅ (+samples/results ▢ split), radiologyOrders ✅, reports ▢
- **OT**: otRooms ▢, surgeries ✅
- **Blood bank**: bloodDonors/bloodUnits ▢ (BloodBank model stub ✅)
- **Pharmacy/Inventory**: medicines, medicineBatches, pharmacySales, purchases ✅, inventoryItems, stockTransactions ▢, suppliers ✅, purchaseOrders/goodsReceipts ▢
- **Money**: bills, billItems, payments, refunds ✅, ledgerTransactions ✅(+Finance model), cashierClosing ✅, insurance (companies/policies/preauth/claims) ✅
- **Insurance**: companies, policies, claims ▢ (Insurance model stub ✅)
- **Operations**: assets ▢, maintenanceTickets ▢, dietOrders ▢, ambulances ▢, mortuary ▢
- **Platform**: notifications ✅, documents ▢, auditLogs ✅, systemSettings ✅, featureFlags ▢, supportTickets ▢, webhookEvents ▢

### 3.3 Integrity rules
- Transactional (must): pharmacy sale→stock→payment; bill→payment→ledger; admit→bed; discharge→bed release→billing; refund→ledger; stock adjustment.
- Immutable money: historical finances are void/reverse/refund/adjust only.
- FEFO selection for batch allocation; expired batch un-sellable.
- Idempotency keys on payments/billing/sales/stock/admission/refund.
- Every sensitive data access (medical records, Rx, reports, documents) → audit entry.

---

## 4. Permission Matrix (roles × modules)

Legend: C=create, V=view, E=edit, X=execute/approve · enforced server-side (`requirePermission`)

| Module | SUPER_ADMIN | HOSPITAL_ADMIN | MANAGEMENT | DOCTOR | NURSE | RECEPTIONIST | PHARMACIST | LAB_TECH | RADIOLOGY | OT/ICU | BILLING | CASHIER | INSURANCE | HR | ACCOUNTANT | STORE/INVENTORY | MAINTENANCE | PATIENT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Auth/Users/Roles | CVXE | CE | V | – | – | – | – | – | – | – | – | – | – | E own | – | – | – | – |
| Patient | CVXE | CVXE | V | V + timeline | V | CVX | V |
| Appointments | CVXE | CVXE | V | CVX | V | CVX | – |
| OPD/IPD/Emergency | V | V | V | CVXE | V/CX | V | – |
| Beds/Bed map | V | CVX | V | V | V | V |
| Pharmacy/Stock | V | V | V | V/Rx | – | CVXE | – | – | – | – | – | – | – | CVX | CVX |
| Lab | V | V | V | CVX(order) | V | V | draft→verify | – |
| Radiology | V | V | V | CVX(order) | V | – | CV(perform/report) | – |
| OT | V | V | V | V | CVX(book/manage) | – |
| Billing/Payments | V | V | V | – | – | – | – | – | – | CVX | CVX | V | V(ledger) |
| Refunds/Adjust | V | V(V) | approve | – |
| Insurance/TPA | V | V | V | V submit | X claims |
| HR | – | V | CE | – | – | CVX |
| Reports/Analytics | V | V | V | own | V | V | V | V | V | V |
| Settings/Masters | CVX | CVX | config | – | – |
| Audit | X | V | configurable-least | – |
| forward Patient portal | self data only |

(Full matrix will live in `server/src/services/auth.service.js` permission seeds as the single source of truth.)

---

## 5. API Architecture

- **Versioning**: existing routes move under `/api/v1/`. Keep `/api` alias during transition, drop later. All new modules are `/api/v1/*`.
- **Envelope** (kept): success `{success, message, data, pagination?}` · error `{success:false, message, code, errors?}`.
- **Error codes** (new): `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_FAILURE`, `IDEMPOTENCY_REPLAY`, `INTERNAL`.
- **Tenant scoping**: middleware injects `req.tenant = {orgId, hospitalId, branchId}` from token/Auth context; services filter on it.
- **Idempotency**: header `Idempotency-Key` on POST/DELETE money+stock+admission; store hash→response, replay safe.
- **Rate limits**: auth(login/refresh) strict; uploads; admin; public; normal tiers.
- **Webhooks**: outbound signatures (HMAC), inbound verification, event IDs, replay guard.
- **OpenAPI**: generate from route+validator metadata (`/api/v1/docs`, swagger-ui) — per-module, keep in sync per phase.
- **Health**: `/health`, `/api/v1/health`, `/api/v1/readiness` (db + redis + storage + queue pings).

---

## 6. Frontend Architecture

- Stack (existing): React 18+Vite, React Router, TanStack Query (server state), Tailwind. Add: Zustand (client-only global: session, layout, socket status), React Hook Form+Zod (forms), TanStack Table (data grids), recharts (analytics), Framer Motion (micro-interactions), lucide, date-fns.
- **Rebrand to "Clinical Command Center":** premium/minimal/info-dense, high-contrast, restrained accent system, no neon/gradient abuse, reduced-motion support. Design tokens in `client/src/styles`.
- **Route map (module-scoped):**
```
/login · /dashboard
/patients /patients/:id (Patient 360, tabs: overview/timeline/opd/ipd/emergency/vitals/dx/rx/lab/radiology/ot/nursing/pharmacy/billing/payments/insurance/documents/discharge/followup)
/appointments /queue (reception live board, auto-refresh) /opd (workspace) /emergency
/ipd (admissions) /beds (Bed Command Center, auto-refresh)
/ipd (bed command center + admissions) /icu
/pharmacy (POS/stock/purchase) /inventory
/lab (LIS board, samples, results) /radiology
/ot (calendar) /blood-bank
/billing (workspace, payments, cashier closing) /cashier (shift collect+close, variance) /insurance (companies, policies, pre-auth, claims)
/reports /analytics (management command center)
/hr /assets /maintenance /dietary /ambulance
/settings (hospital config) /admin (super-admin console)
/patient-portal /telemedicine
```
- **Global command palette** `Ctrl+K`: search patients/doctors/appointments/bills/meds/lab/admissions/beds/insurance; quick actions (new appointment, bill, admit). Built on the global-search API.
- **State**: TanStack Query for server state/cache; Zustand for `session`, `layout`, `socket presence`, `command palette`. Forms local via RHF. No over-globalization.
- **Mobile**: doctor/nurse mobile-optimized views; reception/pharmacy desktop-first.

---

## 7. Real-Time, Notifications, AI, Integrations (abstractions)

- **Real-time (Socket.IO)**: queues, bed map, emergency board, lab completion, notifications, pharmacy order status, live dashboard counters. Scoped rooms per hospital/branch; auth via token. Not used where polling is fine.
- **Notification engine**: in-app now; adapters for email/SMS/WhatsApp/push (boundaries only — no fake senders).
- **AIProvider abstraction** (`server/src/integrations/ai/*`): interface `generate() summarize() classify() extract()`; provider registry (OpenAI/Anthropic/Google/Local/Ollama) behind config; ERP works with AI off. All AI output labeled "AI-generated assistance — verify before clinical use". Never auto-diagnose/prescribe.
- **Document intelligence**: upload→validate(MIME/size)→store metadata→OCR/extract adapter→human review→structured data; OCR never trusted blindly.
- **Integration adapters** (explicit boundaries, non-functional until configured): payment gateways, SMS/WhatsApp/email, accounting, lab devices, PACS/DICOM, barcode, printers, insurance, biometric.
- **Search abstraction**: MongoDB text index now; seam for Elasticsearch/OpenSearch later.
- **Jobs/queue**: BullMQ+Redis for email, notifications, report generation, document processing, reminders, backups (optional in dev).

---

## 8. Deployment & SaaS

- Docker + Docker Compose: `api`, `client (nginx)`, `mongo`, `redis`, `worker`; env-driven. Health checks wired to `/api/v1/health`.
- Observability: structured winston logs (existing), request ids, per-route latency; seams for Sentry/OTel/Prometheus without hard dependency.
- Backups: daily/weekly/monthly; includes db + documents + config; restore drill documented.
- SaaS: plans STARTER/PROFESSIONAL/ENTERPRISE; feature flags (`ENABLE_AI`, `ENABLE_TELEMEDICINE`, `ENABLE_BLOOD_BANK`, `ENABLE_ICU`, `ENABLE_PATIENT_PORTAL`, `ENABLE_WHATSAPP`, …) drive menu/API; super-admin console for hospitals/usage/subscriptions/health/support; support-ticket system.
- Healthcare security posture: least privilege, minimum-necessary access, audit, encryption in transit/at rest, secure backups, data retention config, export, controlled deletion; jurisdiction-adaptive compliance docs.

---

## 9. Development Phases (gated)

**Quality gate per phase:** DB (schema/indexes) · API (validation/authz/txn/errors) · Frontend (UI/responsive/loading/empty/error) · Security (perm/audit/validation) · Tests · Docs. No-next-phase until gate passes.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Architecture (this doc), design system, `/api/v1` + error codes, OpenAPI base, tenancy keys, feature flags, health checks | **START HERE** |
| 1 | Hospital/Users/Roles/Departments/Dashboard/Patient — existing; hardening: Patient 360, merge, dup detection | ✅ core / refine |
| 2 | Reception: appointments, queue live board, OPD workspace, doctor list | ✅ core / queue realtime ▢ |
| 3 | Emergency, IPD, bed command center, nursing, eMAR, ICU | ✅ IPD / ICU+eMAR ▢ |
| 4 | Pharmacy POS, inventory, purchase/PO/GRN, suppliers | ✅ core / PO+GRN ▢ |
| 5 | Lab (samples/results/reports split), radiology report workflow, report engine | ✅ core / depth ▢ |
| 6 | Billing, payments, refunds, cashier closing, ledger, insurance/TPA | ⏳ cashier closing ✅ + insurance/TPA ✅ |
| 7 | OT calendar, blood bank, discharge summary, follow-up | partial (stubs) |
| 8 | HR, assets, maintenance, housekeeping, dietary, ambulance, mortuary | ▢ |
| 9 | Management command center, advanced analytics, patient portal, doctor portal, telemedicine seam | ▢ |
| 10 | AI layer, notification channels, integrations, workflow engine, approval engine | ▢ |
| 11 | SaaS, subscriptions, multi-hospital, super admin console | ▢ |
| 12 | Security hardening, perf, observability, deployment, E2E full-journey tests | ▢ |

**Execution model:** each phase = DB → backend → API → frontend → validation → RBAC → audit → tests → docs, verified against the real running stack (in-memory Mongo in dev).

---

## 10. Cross-Module Dependencies Table

| If you touch… | You must not break / must extend… | Influences… |
| --- | --- | --- |
| Patient model | timeline, dup detection, auth-independent | OPD/IPD/Emergency/Portal/Search |
| Bed/Admission | bed map, occupancy stats | IPD/ICU/Reports |
| Pharmacy stock | FEFO, batch expiry, ledger | POS/Inventory/Lab(no)/Billing |
| LabTest/LabOrder | sample statuses, criticals, billing | LIS/Patient 360/Notifications |
| Bill/Payment/Refund | ledger, cashier, outstanding, export | all money surfaces |
| Role/Permission | authz middleware + client menu | every module |
| Numbering/Counter | concurrency safety | every document number |
| Timeline | event linkage | Patient 360, audit |
| Socket.IO presence | bed map/queue/emergency | Realtime UI |

---

## 11. Immediate Next Actions (Phase 0 kickoff)

1. Rebrand shell: package names + `ZhanX HospitalOS` branding + design tokens ("Clinical Command Center").
2. Introduce `/api/v1/` mount (preserve `/api` alias), add stable error `code`s, request-id + response timing.
3. Add tenant keys + `req.tenant` middleware (no data migration yet — additive fields).
4. Feature-flags + `/api/v1/health` + `/api/v1/readiness`.
5. Global search API (`/api/v1/search`) against MongoDB text indexes; wire Ctrl+K palette.
6. Add `Idempotency-Key` handling on money/stock/admission endpoints.
7. Keep 11 unit tests + smoke green; add Phase 0 tests (health, version, error codes, flag gating).