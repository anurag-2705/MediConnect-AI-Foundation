BEGIN;

-- ==========================================
-- 1. ADD APPOINTMENT DURATION
-- ==========================================

ALTER TABLE appointment_requests
ADD COLUMN duration_minutes SMALLINT NOT NULL DEFAULT 30;

ALTER TABLE appointment_requests
ADD CONSTRAINT appointment_duration_check
CHECK (duration_minutes BETWEEN 15 AND 120);


-- ==========================================
-- 2. ADD APPOINTMENT END TIME
-- ==========================================

ALTER TABLE appointment_requests
ADD COLUMN requested_end_at TIMESTAMPTZ;

-- Populate existing appointments.
UPDATE appointment_requests
SET requested_end_at =
    requested_start_at + make_interval(mins => duration_minutes);


-- ==========================================
-- 3. AUTOMATICALLY MAINTAIN END TIME
-- ==========================================

CREATE OR REPLACE FUNCTION set_appointment_end_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.requested_end_at :=
        NEW.requested_start_at
        + make_interval(mins => NEW.duration_minutes);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_appointment_end_time
BEFORE INSERT OR UPDATE OF requested_start_at, duration_minutes
ON appointment_requests
FOR EACH ROW
EXECUTE FUNCTION set_appointment_end_time();

ALTER TABLE appointment_requests
ALTER COLUMN requested_end_at SET NOT NULL;


-- ==========================================
-- 4. ENABLE OVERLAP PROTECTION
-- ==========================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointment_requests
ADD CONSTRAINT appointment_no_doctor_overlap
EXCLUDE USING GIST (
    doctor_profile_id WITH =,
    tstzrange(
        requested_start_at,
        requested_end_at,
        '[)'
    ) WITH &&
)
WHERE (
    status IN ('pending', 'accepted')
);


-- ==========================================
-- 5. IMPROVE APPOINTMENT LOOKUPS
-- ==========================================

CREATE INDEX idx_appointments_doctor_active
ON appointment_requests (
    doctor_profile_id,
    requested_start_at
)
WHERE status IN ('pending', 'accepted');


COMMIT;