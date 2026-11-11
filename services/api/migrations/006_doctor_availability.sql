BEGIN;

-- ==========================================
-- 1. ADD DOCTOR TIMEZONE
-- ==========================================

ALTER TABLE doctor_profiles
ADD COLUMN timezone_name VARCHAR(100)
NOT NULL DEFAULT 'Asia/Kolkata';


-- ==========================================
-- 2. CREATE WEEKLY AVAILABILITY TABLE
-- ==========================================

CREATE TABLE doctor_weekly_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    doctor_profile_id UUID NOT NULL
        REFERENCES doctor_profiles(id)
        ON DELETE CASCADE,

    -- ISO weekday: Monday = 1, Sunday = 7
    day_of_week SMALLINT NOT NULL
        CHECK (day_of_week BETWEEN 1 AND 7),

    start_time TIME NOT NULL,

    end_time TIME NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT doctor_availability_time_check
        CHECK (end_time > start_time)
);


-- ==========================================
-- 3. PREVENT OVERLAPPING WORKING PERIODS
-- ==========================================

ALTER TABLE doctor_weekly_availability
ADD CONSTRAINT doctor_availability_no_overlap
EXCLUDE USING GIST (
    doctor_profile_id WITH =,
    day_of_week WITH =,
    tsrange(
        DATE '2000-01-03' + start_time,
        DATE '2000-01-03' + end_time,
        '[)'
    ) WITH &&
)
WHERE (is_active = TRUE);


-- ==========================================
-- 4. ADD LOOKUP INDEX
-- ==========================================

CREATE INDEX idx_doctor_availability_lookup
ON doctor_weekly_availability (
    doctor_profile_id,
    day_of_week
)
WHERE is_active = TRUE;


COMMIT;