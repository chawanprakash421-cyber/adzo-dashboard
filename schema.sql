-- ============================================================
-- ADZO Platform — Supabase Schema
-- Paste this in Supabase SQL Editor and click Run
-- ============================================================

-- 1. BUSINESSES
CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  status      TEXT DEFAULT 'trial',
  plan        TEXT DEFAULT 'trial',
  plan_expiry TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT DEFAULT 'client',
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LEADS
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  source        TEXT DEFAULT 'manual',
  locality      TEXT,
  property_type TEXT,
  budget        TEXT,
  timeline      TEXT,
  status        TEXT DEFAULT 'new',
  score         INTEGER,
  score_reason  TEXT,
  follow_up_date DATE,
  notes         TEXT,
  assigned_to   UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CAMPAIGNS
CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  platform        TEXT NOT NULL,
  objective       TEXT DEFAULT 'lead_generation',
  status          TEXT DEFAULT 'draft',
  daily_budget    NUMERIC(10,2),
  total_spend     NUMERIC(10,2) DEFAULT 0,
  total_leads     INTEGER DEFAULT 0,
  target_locality TEXT,
  ad_copy         TEXT,
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CONTENT ITEMS
CREATE TABLE IF NOT EXISTS content_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID REFERENCES businesses(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  topic        TEXT NOT NULL,
  tone         TEXT DEFAULT 'professional',
  body_text    TEXT,
  status       TEXT DEFAULT 'generating',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. WALLETS
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  balance     NUMERIC(10,2) DEFAULT 0,
  plan        TEXT,
  plan_expiry TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID REFERENCES businesses(id) ON DELETE CASCADE,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT UNIQUE,
  amount              NUMERIC(10,2),
  status              TEXT DEFAULT 'pending',
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_business   ON leads(business_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_biz    ON campaigns(business_id, status);
CREATE INDEX IF NOT EXISTS idx_content_biz      ON content_items(business_id, status);
