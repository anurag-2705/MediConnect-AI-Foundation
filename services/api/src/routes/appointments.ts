import { Router } from "express";
import { z } from "zod";
import { query, inTransaction } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = Router();

router.use(authenticate);

// ========================================
// 1. PATIENT REQUESTS AN APPOINTMENT
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

      const appointment = await inTransaction(async client => {
        const result = await client.query(
          `INSERT INTO appointment_requests
           (patient_user_id, doctor_profile_id, appointment_type,
            requested_start_at, reason)
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

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: "appointment.created",
          targetType: "appointment",
          targetId: String(result.rows[0].id)
        });

        return result.rows[0];
      });

      return res.status(201).json({
        message: "Appointment request submitted successfully",
        appointment
      });

    } catch (error) {
      console.error("Appointment creation failed:", error);

      return res.status(500).json({
        error: "Unable to create appointment"
      });
    }
  }
);

// ========================================
// 2. PATIENT VIEWS OWN APPOINTMENTS
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
// 3. DOCTOR VIEWS APPOINTMENT REQUESTS
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
// 4. DOCTOR ACCEPTS OR REJECTS REQUEST
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
      console.error("Appointment decision failed:", error);

      return res.status(500).json({
        error: "Unable to update appointment"
      });
    }
  }
);

// ========================================
// 5. PATIENT CANCELS APPOINTMENT
// ========================================

router.patch(
  "/:appointmentId/cancel",
  requireRole("patient"),
  async (req, res) => {
    const idCheck = z.string().uuid().safeParse(
      String(req.params.appointmentId)
    );

    if (!idCheck.success) {
      return res.status(400).json({
        error: "Invalid appointment ID"
      });
    }

    try {
      const appointmentId = String(req.params.appointmentId);

      const updated = await inTransaction(async client => {
        const result = await client.query(
          `UPDATE appointment_requests
           SET status = 'cancelled',
               updated_at = NOW()
           WHERE id = $1::uuid
             AND patient_user_id = $2::uuid
             AND status = 'pending'
           RETURNING *`,
          [appointmentId, req.auth!.userId]
        );

        if (!result.rowCount) {
          return null;
        }

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: "appointment.cancelled",
          targetType: "appointment",
          targetId: appointmentId
        });

        return result.rows[0];
      });

      if (!updated) {
        return res.status(404).json({
          error: "Pending appointment not found"
        });
      }

      return res.json({
        message: "Appointment cancelled successfully",
        appointment: updated
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