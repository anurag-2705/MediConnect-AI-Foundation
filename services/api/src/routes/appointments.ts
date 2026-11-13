import { Router } from "express";
import { z } from "zod";
import { query, inTransaction } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = Router();

router.use(authenticate);

// ========================================
// 1. GET AVAILABLE APPOINTMENT SLOTS
// ========================================

router.get(
  "/available-slots",
  requireRole("patient"),
  async (req, res) => {
    const schema = z.object({
      doctorProfileId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });

    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid availability request",
        details: parsed.error.flatten()
      });
    }

    const { doctorProfileId, date } = parsed.data;

    try {
      const doctor = await query(
        `SELECT d.id, d.timezone_name
         FROM doctor_profiles d
         JOIN users u ON u.id = d.user_id
         WHERE d.id = $1
           AND d.verification_status = 'verified'
           AND u.status = 'active'`,
        [doctorProfileId]
      );

      if (!doctor.rowCount) {
        return res.status(404).json({
          error: "Verified doctor not found"
        });
      }

      const timezone = doctor.rows[0].timezone_name;

      const result = await query(
        `WITH periods AS (
           SELECT
             (($2::date + a.start_time)
               AT TIME ZONE $3) AS period_start,

             (($2::date + a.end_time)
               AT TIME ZONE $3) AS period_end

           FROM doctor_weekly_availability a

           WHERE a.doctor_profile_id = $1
             AND a.day_of_week =
                 EXTRACT(ISODOW FROM $2::date)::integer
             AND a.is_active = TRUE
         ),

         slots AS (
           SELECT generated.slot_start

           FROM periods p

           CROSS JOIN LATERAL generate_series(
             p.period_start,
             p.period_end - INTERVAL '30 minutes',
             INTERVAL '30 minutes'
           ) AS generated(slot_start)
         )

         SELECT slot_start

         FROM slots s

         WHERE s.slot_start > NOW()

           AND NOT EXISTS (
             SELECT 1
             FROM appointment_requests a

             WHERE a.doctor_profile_id = $1
               AND a.status IN ('pending', 'accepted')

               AND tstzrange(
                 a.requested_start_at,
                 a.requested_end_at,
                 '[)'
               )
               &&
               tstzrange(
                 s.slot_start,
                 s.slot_start + INTERVAL '30 minutes',
                 '[)'
               )
           )

         ORDER BY slot_start ASC`,
        [doctorProfileId, date, timezone]
      );

      return res.json({
        doctorProfileId,
        date,
        timezone,
        slotDurationMinutes: 30,
        count: result.rowCount,
        slots: result.rows.map(row =>
          new Date(row.slot_start).toISOString()
        )
      });

    } catch (error) {
      console.error("Available slots retrieval failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve available appointment slots"
      });
    }
  }
);

// ========================================
// 2. PATIENT REQUESTS AN APPOINTMENT
// ========================================

const appointmentSchema = z.object({
  doctorProfileId: z.string().uuid(),
  appointmentType: z.enum(["in_person", "video", "home_visit"]),
  requestedStartAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(2000)
});

router.post(
  "/",
  requireRole("patient"),
  async (req, res) => {
    const parsed = appointmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid appointment details",
        details: parsed.error.flatten()
      });
    }

    const data = parsed.data;

    if (new Date(data.requestedStartAt).getTime() <= Date.now()) {
      return res.status(400).json({
        error: "Appointment must be scheduled for a future time"
      });
    }

    try {
      const doctor = await query(
        `SELECT d.id
         FROM doctor_profiles d
         JOIN users u ON u.id = d.user_id
         WHERE d.id = $1
           AND d.verification_status = 'verified'
           AND u.status = 'active'`,
        [data.doctorProfileId]
      );

      if (!doctor.rowCount) {
        return res.status(404).json({
          error: "Verified doctor not found"
        });
      }

      const bookingResult = await inTransaction(async client => {

        // 1. Validate doctor's working hours.

        const availabilityCheck = await client.query(
          `SELECT EXISTS (
             SELECT 1

             FROM doctor_profiles d

             JOIN users u
               ON u.id = d.user_id

             JOIN doctor_weekly_availability a
               ON a.doctor_profile_id = d.id

             CROSS JOIN LATERAL (
               SELECT
                 $2::timestamptz
                 AT TIME ZONE d.timezone_name AS local_start
             ) candidate

             WHERE d.id = $1
               AND d.verification_status = 'verified'
               AND u.status = 'active'
               AND a.is_active = TRUE

               AND a.day_of_week =
                   EXTRACT(ISODOW FROM candidate.local_start)::integer

               AND candidate.local_start::date =
                   (
                     candidate.local_start
                     + INTERVAL '30 minutes'
                   )::date

               AND candidate.local_start::time >= a.start_time

               AND (
                 candidate.local_start
                 + INTERVAL '30 minutes'
               )::time <= a.end_time

               AND MOD(
                 EXTRACT(
                   EPOCH FROM (
                     candidate.local_start -
                     (
                       candidate.local_start::date
                       + a.start_time
                     )
                   )
                 ),
                 1800
               ) = 0
           ) AS is_available`,
          [data.doctorProfileId, data.requestedStartAt]
        );

        if (!availabilityCheck.rows[0].is_available) {
          return {
            unavailable: true as const
          };
        }

        // 2. Create appointment.

        const result = await client.query(
          `INSERT INTO appointment_requests
           (
             patient_user_id,
             doctor_profile_id,
             appointment_type,
             requested_start_at,
             reason
           )
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            req.auth!.userId,
            data.doctorProfileId,
            data.appointmentType,
            data.requestedStartAt,
            data.reason
          ]
        );

        // 3. Record audit event.

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: "appointment.created",
          targetType: "appointment",
          targetId: String(result.rows[0].id)
        });

        return {
          unavailable: false as const,
          appointment: result.rows[0]
        };
      });

      if (bookingResult.unavailable) {
        return res.status(409).json({
          error: "The selected time is outside the doctor's available working hours or is not a valid appointment slot."
        });
      }

      return res.status(201).json({
        message: "Appointment request submitted successfully",
        appointment: bookingResult.appointment
      });

    } catch (error) {
      const dbError = error as { code?: string };

      if (dbError.code === "23P01") {
        return res.status(409).json({
          error: "This doctor already has an appointment during the selected time. Please choose another slot."
        });
      }

      console.error("Appointment creation failed:", error);

      return res.status(500).json({
        error: "Unable to create appointment"
      });
    }
  }
);

// ========================================
// 3. PATIENT VIEWS OWN APPOINTMENTS
// ========================================

router.get(
  "/me",
  requireRole("patient"),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT
           a.*,
           u.display_name AS doctor_name,
           d.specialization
         FROM appointment_requests a
         JOIN doctor_profiles d ON d.id = a.doctor_profile_id
         JOIN users u ON u.id = d.user_id
         WHERE a.patient_user_id = $1
         ORDER BY a.requested_start_at DESC`,
        [req.auth!.userId]
      );

      return res.json({
        count: result.rowCount,
        appointments: result.rows
      });

    } catch (error) {
      console.error("Patient appointments retrieval failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve appointments"
      });
    }
  }
);

// ========================================
// 4. DOCTOR VIEWS APPOINTMENT REQUESTS
// ========================================

router.get(
  "/doctor",
  requireRole("clinician"),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT
           a.*,
           u.display_name AS patient_name
         FROM appointment_requests a
         JOIN doctor_profiles d ON d.id = a.doctor_profile_id
         JOIN users u ON u.id = a.patient_user_id
         WHERE d.user_id = $1
         ORDER BY a.requested_start_at ASC`,
        [req.auth!.userId]
      );

      return res.json({
        count: result.rowCount,
        appointments: result.rows
      });

    } catch (error) {
      console.error("Doctor appointments retrieval failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve doctor appointments"
      });
    }
  }
);

// ========================================
// 5. DOCTOR ACCEPTS OR REJECTS REQUEST
// ========================================

const decisionSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  doctorNote: z.string().trim().max(1000).optional()
});

router.patch(
  "/:appointmentId/decision",
  requireRole("clinician"),
  async (req, res) => {
    const idCheck = z.string().uuid().safeParse(
      String(req.params.appointmentId)
    );

    if (!idCheck.success) {
      return res.status(400).json({
        error: "Invalid appointment ID"
      });
    }

    const parsed = decisionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid appointment decision",
        details: parsed.error.flatten()
      });
    }

    try {
      const appointmentId = String(req.params.appointmentId);

      const updated = await inTransaction(async client => {
        const result = await client.query(
          `UPDATE appointment_requests a
           SET
             status = $1::varchar,
             doctor_note = $2::text,
             decided_at = NOW(),
             updated_at = NOW()
           FROM doctor_profiles d
           WHERE a.id = $3::uuid
             AND d.id = a.doctor_profile_id
             AND d.user_id = $4::uuid
             AND d.verification_status = 'verified'
             AND a.status = 'pending'
           RETURNING a.*`,
          [
            parsed.data.status,
            parsed.data.doctorNote ?? null,
            appointmentId,
            req.auth!.userId
          ]
        );

        if (!result.rowCount) {
          return null;
        }

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: `appointment.${parsed.data.status}`,
          targetType: "appointment",
          targetId: appointmentId
        });

        return result.rows[0];
      });

      if (!updated) {
        return res.status(404).json({
          error: "Pending appointment not found for this doctor"
        });
      }

      return res.json({
        message: `Appointment ${parsed.data.status} successfully`,
        appointment: updated
      });

    } catch (error) {
      const dbError = error as { code?: string };

      if (dbError.code === "23P01") {
        return res.status(409).json({
          error: "Cannot accept this appointment because the doctor has another appointment during this time."
        });
      }

      console.error("Appointment decision failed:", error);

      return res.status(500).json({
        error: "Unable to update appointment"
      });
    }
  }
);

// ========================================
// 6. PATIENT / CLINICIAN CANCELS APPOINTMENT
// ========================================

const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(1000)
});

router.patch(
  "/:appointmentId/cancel",
  requireRole("patient", "clinician"),
  async (req, res) => {
    const idCheck = z.string().uuid().safeParse(
      String(req.params.appointmentId)
    );

    if (!idCheck.success) {
      return res.status(400).json({
        error: "Invalid appointment ID"
      });
    }

    const parsed = cancellationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "A cancellation reason between 3 and 1000 characters is required",
        details: parsed.error.flatten()
      });
    }

    try {
      const appointmentId = String(req.params.appointmentId);
      const userId = req.auth!.userId;
      const role = req.auth!.role;

      const result = await inTransaction(async client => {

        // 1. Find and lock the appointment.
        // Verify that the current user owns or manages it.

        const existing = await client.query(
          `SELECT
             a.id,
             a.status,
             a.requested_start_at,
             (a.requested_start_at > NOW()) AS is_future

           FROM appointment_requests a

           LEFT JOIN doctor_profiles d
             ON d.id = a.doctor_profile_id

           WHERE a.id = $1::uuid

             AND (
               ($2 = 'patient'
                 AND a.patient_user_id = $3::uuid)

               OR

               ($2 = 'clinician'
  AND d.user_id = $3::uuid
  AND d.verification_status = 'verified')
             )

           FOR UPDATE OF a`,
          [appointmentId, role, userId]
        );

        if (!existing.rowCount) {
          return { kind: "not_found" as const };
        }

        const appointment = existing.rows[0];

        // 2. Only pending and accepted appointments can be cancelled.

        if (!["pending", "accepted"].includes(appointment.status)) {
          return { kind: "invalid_status" as const };
        }

        // 3. Prevent cancellation of appointments that have already started.

        if (!appointment.is_future) {
          return { kind: "appointment_started" as const };
        }

        // 4. Update cancellation information.

        const updated = await client.query(
          `UPDATE appointment_requests

           SET
             status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by_user_id = $1::uuid,
             cancellation_reason = $2,
             updated_at = NOW()

           WHERE id = $3::uuid

           RETURNING *`,
          [userId, parsed.data.reason, appointmentId]
        );

        // 5. Record audit history.

        await audit(client, {
          actorUserId: userId,
          action: `appointment.cancelled_by_${role}`,
          targetType: "appointment",
          targetId: appointmentId
        });

        return {
          kind: "success" as const,
          appointment: updated.rows[0]
        };
      });

      // 6. Handle different outcomes.

      if (result.kind === "not_found") {
        return res.status(404).json({
          error: "Appointment not found or you do not have permission to cancel it"
        });
      }

      if (result.kind === "invalid_status") {
        return res.status(409).json({
          error: "Only pending or accepted appointments can be cancelled"
        });
      }

      if (result.kind === "appointment_started") {
        return res.status(409).json({
          error: "An appointment that has already started cannot be cancelled"
        });
      }

      return res.json({
        message: "Appointment cancelled successfully",
        appointment: result.appointment
      });

    } catch (error) {
      console.error("Appointment cancellation failed:", error);

      return res.status(500).json({
        error: "Unable to cancel appointment"
      });
    }
  }
);

export default router;