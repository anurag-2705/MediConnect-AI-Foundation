BEGIN;

-- ========================================
-- APPOINTMENT REQUESTS
-- ========================================

CREATE TABLE appointment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    doctor_profile_id UUID NOT NULL
        REFERENCES doctor_profiles(id) ON DELETE RESTRICT,

    appointment_type VARCHAR(30) NOT NULL
        CHECK (
            appointment_type IN (
                'in_person',
                'video',
                'home_visit'
            )
        ),

    requested_start_at TIMESTAMPTZ NOT NULL,

    reason TEXT NOT NULL
        CHECK (char_length(reason) BETWEEN 3 AND 2000),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'accepted',
                'rejected',
                'cancelled',
                'completed'
            )
        ),

    doctor_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    decided_at TIMESTAMPTZ,

    CONSTRAINT appointment_decision_check CHECK (
        (status IN ('accepted', 'rejected') AND decided_at IS NOT NULL)
        OR
        (status NOT IN ('accepted', 'rejected') AND decided_at IS NULL)
    )
);

-- ========================================
-- INDEXES
-- ========================================

CREATE INDEX idx_appointments_patient
ON appointment_requests(patient_user_id, created_at DESC);

CREATE INDEX idx_appointments_doctor
ON appointment_requests(doctor_profile_id, requested_start_at);

CREATE INDEX idx_appointments_status
ON appointment_requests(status, requested_start_at);

COMMIT;