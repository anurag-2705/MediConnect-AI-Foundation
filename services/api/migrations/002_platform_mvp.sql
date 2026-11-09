-- Non-clinical coordination MVP. No diagnosis, prescriptions, triage or dispatch.
CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120) NOT NULL,
  preferred_language VARCHAR(16) NOT NULL DEFAULT 'en',
  service_area_id UUID REFERENCES service_areas(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_profiles_area_idx ON patient_profiles(service_area_id);

CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  facility_type VARCHAR(40) NOT NULL CHECK (facility_type IN ('clinic','hospital','health_centre','other')),
  service_area_id UUID NOT NULL REFERENCES service_areas(id),
  address TEXT,
  phone VARCHAR(20),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facilities_area_active_idx ON facilities(service_area_id, is_active);

CREATE TABLE IF NOT EXISTS appointment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id),
  facility_id UUID REFERENCES facilities(id),
  requested_by_user_id UUID NOT NULL REFERENCES users(id),
  requested_date DATE,
  preferred_period VARCHAR(20) CHECK (preferred_period IN ('morning','afternoon','evening','any')),
  purpose_label VARCHAR(100) NOT NULL DEFAULT 'General appointment request',
  status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_requests_patient_idx ON appointment_requests(patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_requests_facility_idx ON appointment_requests(facility_id, status);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES users(id),
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  from_facility_id UUID REFERENCES facilities(id),
  to_facility_id UUID REFERENCES facilities(id),
  status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','accepted','closed','cancelled')),
  coordination_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_patient_idx ON referrals(patient_user_id, created_at DESC);
