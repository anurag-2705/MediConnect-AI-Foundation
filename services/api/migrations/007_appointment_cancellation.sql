BEGIN;

-- 1. Add cancellation metadata
ALTER TABLE appointment_requests
ADD COLUMN cancelled_at TIMESTAMPTZ,
ADD COLUMN cancelled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
ADD COLUMN cancellation_reason TEXT;

-- 2. Allow accepted/rejected appointments to retain decision history
-- after cancellation, while pending appointments must have no decision.
ALTER TABLE appointment_requests
DROP CONSTRAINT appointment_decision_check;

ALTER TABLE appointment_requests
ADD CONSTRAINT appointment_decision_check
CHECK (
    (status NOT IN ('accepted', 'rejected') OR decided_at IS NOT NULL)
    AND
    (status <> 'pending' OR decided_at IS NULL)
);

-- 3. Validate cancellation metadata.
-- Existing legacy cancellations, if any, can retain NULL metadata.
ALTER TABLE appointment_requests
ADD CONSTRAINT appointment_cancellation_metadata_check
CHECK (
    (
        status <> 'cancelled'
        AND cancelled_at IS NULL
        AND cancelled_by_user_id IS NULL
        AND cancellation_reason IS NULL
    )
    OR
    (
        status = 'cancelled'
        AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND char_length(btrim(cancellation_reason)) BETWEEN 3 AND 1000
    )
);

-- 4. Index cancelled appointments for history queries
CREATE INDEX appointment_cancelled_history_idx
ON appointment_requests (cancelled_at DESC)
WHERE status = 'cancelled';

COMMIT;
