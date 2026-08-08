# 2ni Admin Portal

An admin console for the **2ni Viral Content Pipeline**. It adds authentication,
user & role management, a profile area, and a live dashboard that reads from the
pipeline's own `viral_posts` and `generated_content` tables.

Built with **Next.js 14 (App Router)** + **PostgreSQL**. Sessions are signed
JWTs in an http-only cookie; passwords are hashed with bcrypt.

---

## Modules (left sidebar)

| Module | What it does |
|--------|--------------|
| **Dashboard** | Live pipeline metrics: posts scraped, rewrites generated, publish rate, status breakdown, top source pages, recent rewrites. |
| **User Management** | Add/edit users, upload a profile photo, capture basic info, assign a role group, reset passwords, enable/disable, delete. |
| **Role Management** | Create a group and select the list of modules it can access. |
| **Viral Posts** | Browse/search the scraped source posts (`viral_posts`). |
| **Generated Content** | Browse the AI rewrites and their publish status (`generated_content`). |
| **Profile Management** | Every signed-in user can edit their own details, photo, and password. |

Login is by **email _or_ mobile number** + password.

---

## Quick start

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
```
Edit `.env` and set:

- `DATABASE_URL` — point it at the **same** Postgres your pipeline uses (so the
  dashboard has data). Set `DATABASE_SSL=true` for cloud databases
  (Supabase / Neon / Render / Heroku).
- `AUTH_SECRET` — a long random string. Generate one with `openssl rand -base64 48`.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — the default admin created below
  (defaults: `admin@email.com` / `123123123`).

### 3. Initialize the database
```bash
npm run init-db
```
This creates the `roles` and `admin_users` tables (and the pipeline tables if
they don't exist yet), then seeds:

- a **Super Admin** role (all-access),
- the default admin account,
- two example roles (Content Manager, Viewer).

Safe to re-run — it upserts.

### 4. Run
```bash
npm run dev      # http://localhost:3000  (development)
# or
npm run build && npm run start   # production
```

Sign in with your seeded admin credentials.

---

## Default login

```
Email:    admin@email.com
Password: 123123123
```
Change this in **Profile Management** after first sign-in (or before deploying).

---

## How access control works

Each user is assigned one **role group**. A role holds a list of module keys
(e.g. `["dashboard","viral_posts"]`). The sidebar only shows modules the user's
role grants. The **Super Admin** role is all-access and can't be deleted;
**Profile Management** is always available to every signed-in user.

Module keys: `dashboard`, `users`, `roles`, `viral_posts`, `generated_content`,
`profile` (defined in `src/lib/modules.js` — add a page + a key there to extend).

---

## Project layout

```
db/admin_schema.sql          Admin/auth tables (+ pipeline tables, idempotent)
scripts/init-db.js           Applies schema, seeds admin & example roles
src/lib/db.js                Postgres pool (lazy) + query helpers
src/lib/session.js           JWT sign/verify (edge-safe, used by middleware)
src/lib/auth.js              bcrypt + getCurrentUser (loads user + role)
src/lib/modules.js           Module registry + access helpers
src/middleware.js            Redirects unauthenticated users to /login
src/components/               AppShell (sidebar), Modal, Avatar, PhotoUploader
src/app/login/                Login page
src/app/(app)/                Authenticated area (shared sidebar layout)
  dashboard/ users/ roles/ profile/ viral-posts/ generated-content/
src/app/api/                  Route handlers (auth, users, roles, profile,
                              upload, dashboard, viral-posts, generated-content)
public/uploads/               Uploaded profile photos are written here
```

---

## Notes for production

- Set a strong `AUTH_SECRET` and run behind HTTPS (the session cookie is marked
  `secure` in production).
- Uploaded photos are stored on the local filesystem under `public/uploads`.
  On ephemeral/serverless hosts this won't persist — switch the upload route to
  S3 / Cloudinary / Supabase Storage if you deploy there. On a normal VPS (the
  same box that runs your n8n pipeline) the filesystem approach is fine.
- The admin tables live alongside your pipeline tables, so one `DATABASE_URL`
  covers both the console and the dashboard data.
