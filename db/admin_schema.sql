-- =====================================================================
-- 2ni Admin Portal — schema
-- Adds the admin/auth tables alongside the existing pipeline tables.
-- Safe to run repeatedly (IF NOT EXISTS everywhere).
-- =====================================================================

-- ---------------------------------------------------------------------
-- roles  ("Role Management": a named group + the list of modules it can use)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    modules     JSONB       NOT NULL DEFAULT '[]',   -- e.g. ["dashboard","users"]
    is_super    BOOLEAN     NOT NULL DEFAULT FALSE,  -- all-access flag
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- admin_users  ("User Management": login accounts with a role + photo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id            BIGSERIAL PRIMARY KEY,
    full_name     TEXT        NOT NULL,
    email         TEXT        UNIQUE,
    mobile        TEXT        UNIQUE,               -- login by email OR mobile
    password_hash TEXT        NOT NULL,
    photo_url     TEXT,                             -- uploaded profile photo
    role_id       BIGINT      REFERENCES roles(id) ON DELETE SET NULL,
    status        TEXT        NOT NULL DEFAULT 'active',  -- active | disabled
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT email_or_mobile CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users (role_id);

-- ---------------------------------------------------------------------
-- Pipeline tables (created here too so a fresh DB still powers the
-- dashboard). These mirror the pipeline's own schema.sql — if they
-- already exist, nothing changes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viral_posts (
    id            BIGSERIAL PRIMARY KEY,
    fb_post_id    TEXT        NOT NULL UNIQUE,
    page_name     TEXT,
    post_url      TEXT,
    caption       TEXT,
    likes_count   INTEGER     DEFAULT 0,
    shares_count  INTEGER     DEFAULT 0,
    media_url     TEXT,
    media_type    TEXT        DEFAULT 'text',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_content (
    id                   BIGSERIAL PRIMARY KEY,
    post_id              BIGINT      NOT NULL REFERENCES viral_posts(id) ON DELETE CASCADE,
    ai_generated_caption TEXT,
    model_used           TEXT,
    fb_publish_id        TEXT,
    status               TEXT        DEFAULT 'pending',
    posted_at            TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id)
);
