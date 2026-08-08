-- =====================================================================
-- Admin Portal — schema
-- Safe to run repeatedly (IF NOT EXISTS / idempotent ALTERs everywhere).
-- Applied by `npm run init-db`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- roles  ("Role Management": a named group + the modules it may use)
--
-- `modules` holds module keys from src/lib/modules.ts, e.g.
--   ["dashboard","users"]
-- `is_super` is an all-access flag; it can only be set by this script,
-- never through the API.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    modules     JSONB       NOT NULL DEFAULT '[]',
    is_super    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- admin_users  ("User Management": sign-in accounts with a role + photo)
--
-- token_version backs session revocation: it is embedded in every issued
-- JWT and compared on each request, so incrementing it invalidates all of
-- that user's outstanding sessions immediately. Bumped on password change,
-- admin password reset, and when an account is disabled.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id            BIGSERIAL PRIMARY KEY,
    full_name     TEXT        NOT NULL,
    email         TEXT        UNIQUE,
    mobile        TEXT        UNIQUE,               -- sign in by email OR mobile
    password_hash TEXT        NOT NULL,
    photo_url     TEXT,                             -- served via /api/uploads/:name
    role_id       BIGINT      REFERENCES roles(id) ON DELETE SET NULL,
    status        TEXT        NOT NULL DEFAULT 'active',  -- active | disabled
    token_version INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_or_mobile CHECK (email IS NOT NULL OR mobile IS NOT NULL),
    CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'disabled'))
);

-- Upgrade path for databases created before session revocation existed.
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users (role_id);

-- Sign-in matches on lower(email); without this index that is a table scan.
CREATE INDEX IF NOT EXISTS idx_admin_users_email_lower
    ON admin_users (lower(email));
