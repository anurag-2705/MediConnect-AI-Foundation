BEGIN;

-- ==========================================
-- MEDICONNECT AI: DOCTOR MANAGEMENT
-- Migration: 003
-- ==========================================

CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE RESTRICT,

    registration_number VARCHAR(100) NOT NULL,
    registration_council VARCHAR(200) NOT NULL,

    specialization VARCHAR(150),
    qualifications TEXT NOT NULL,

    years_of_experience SMALLINT NOT NULL DEFAULT 0
        CHECK (years_of_experience BETWEEN 0 AND 60),

    bio TEXT,

    languages TEXT[] NOT NULL DEFAULT ARRAY['hi']::TEXT[],

    verification_status VARCHAR(30) NOT NULL DEFAULT 'pending_review'
        CHECK (
            verification_status IN (
                'pending_review',
                'verified',
                'rejected',
                'suspended'
            )
        ),

    verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_doctor_registration
        UNIQUE (registration_council, registration_number),

    CONSTRAINT doctor_verification_metadata_check
        CHECK (
            (
                verification_status = 'verified'
                AND verified_by IS NOT NULL
                AND verified_at IS NOT NULL
            )
            OR
            (
                verification_status <> 'verified'
                AND verified_at IS NULL
            )
        )
);

-- Indexes for faster doctor searches

CREATE INDEX idx_doctor_profiles_verified
ON doctor_profiles (verification_status, specialization);

CREATE INDEX idx_doctor_profiles_user
ON doctor_profiles (user_id);

COMMIT;
