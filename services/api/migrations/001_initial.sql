BEGIN;

DO $$ BEGIN
  CREATE TYPE service_area_level AS ENUM ('state', 'district', 'block', 'village');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'community_health_worker', 'clinician', 'platform_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending_verification', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE otp_purpose AS ENUM ('verify_phone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES service_areas(id) ON DELETE RESTRICT,
  level service_area_level NOT NULL,
  code varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_area_parent_shape CHECK (
    (level = 'state' AND parent_id IS NULL) OR
    (level <> 'state' AND parent_id IS NOT NULL)
  ),
  CONSTRAINT service_area_parent_name_unique UNIQUE (parent_id, level, name)
);
CREATE INDEX IF NOT EXISTS idx_service_areas_parent ON service_areas(parent_id, level) WHERE is_active = true;

CREATE OR REPLACE FUNCTION validate_service_area_parent() RETURNS trigger AS $$
DECLARE parent_level service_area_level;
BEGIN
  IF NEW.level = 'state' THEN
    IF NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'State cannot have a parent'; END IF;
    RETURN NEW;
  END IF;
  SELECT level INTO parent_level FROM service_areas WHERE id = NEW.parent_id;
  IF parent_level IS NULL THEN RAISE EXCEPTION 'Parent service area does not exist'; END IF;
  IF (NEW.level = 'district' AND parent_level <> 'state') OR
     (NEW.level = 'block' AND parent_level <> 'district') OR
     (NEW.level = 'village' AND parent_level <> 'block') THEN
    RAISE EXCEPTION 'Invalid service area hierarchy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_validate_service_area_parent ON service_areas;
CREATE TRIGGER trg_validate_service_area_parent
BEFORE INSERT OR UPDATE OF parent_id, level ON service_areas
FOR EACH ROW EXECUTE FUNCTION validate_service_area_parent();

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name varchar(120) NOT NULL,
  phone_e164 varchar(16) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'pending_verification',
  preferred_locale varchar(20) NOT NULL DEFAULT 'hi',
  home_service_area_id uuid REFERENCES service_areas(id) ON DELETE RESTRICT,
  phone_verified_at timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_home_area_required CHECK (role <> 'patient' OR home_service_area_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_home_area ON users(home_service_area_id) WHERE home_service_area_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS worker_area_assignments (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  service_area_id uuid NOT NULL REFERENCES service_areas(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_assignment_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_active ON worker_area_assignments(user_id, service_area_id)
  WHERE ends_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_assignment_unique_active
  ON worker_area_assignments(user_id, service_area_id) WHERE ends_at IS NULL;

CREATE TABLE IF NOT EXISTS worker_invitations (
  id uuid PRIMARY KEY,
  phone_e164 varchar(16) NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  service_area_id uuid NOT NULL REFERENCES service_areas(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_invites_phone ON worker_invitations(phone_e164, expires_at)
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose otp_purpose NOT NULL,
  otp_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_active ON otp_challenges(user_id, purpose, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_session_id uuid REFERENCES auth_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose varchar(80) NOT NULL,
  notice_version varchar(40) NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  source varchar(40) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consent_user_purpose ON consent_records(user_id, purpose, granted_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  target_type varchar(80) NOT NULL,
  target_id uuid,
  service_area_id uuid REFERENCES service_areas(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_area_created ON audit_events(service_area_id, created_at DESC);

COMMIT;
