import { Router } from "express";
import { z } from "zod";
import { query, inTransaction } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { audit } from "../lib/audit";

const router = Router();

router.use(authenticate);

// ========================================
// 1. CREATE DOCTOR PROFILE
// ========================================

const doctorSchema = z.object({
  registrationNumber: z.string().trim().min(3).max(100),
  registrationCouncil: z.string().trim().min(2).max(200),
  specialization: z.string().trim().max(150).optional(),
  qualifications: z.string().trim().min(2).max(2000),
  yearsOfExperience: z.number().int().min(0).max(60).default(0),
  bio: z.string().trim().max(2000).optional(),
  languages: z.array(z.string().trim().min(2).max(20)).max(10).default(["hi"])
});

router.post("/profile", requireRole("clinician"), async (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid doctor profile",
      details: parsed.error.flatten()
    });
  }

  try {
    const data = parsed.data;

    const result = await query(
      `INSERT INTO doctor_profiles
       (user_id, registration_number, registration_council, specialization,
        qualifications, years_of_experience, bio, languages)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.auth!.userId,
        data.registrationNumber,
        data.registrationCouncil,
        data.specialization ?? null,
        data.qualifications,
        data.yearsOfExperience,
        data.bio ?? null,
        data.languages
      ]
    );

    return res.status(201).json({
      message: "Doctor profile submitted for verification",
      profile: result.rows[0]
    });

  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        error: "Doctor profile or registration already exists"
      });
    }

    console.error("Doctor profile creation failed:", error);

    return res.status(500).json({
      error: "Unable to create doctor profile"
    });
  }
});

// ========================================
// 2. GET OWN DOCTOR PROFILE
// ========================================

router.get("/me", requireRole("clinician"), async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, u.display_name, u.phone_e164
       FROM doctor_profiles d
       JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1`,
      [req.auth!.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Doctor profile not found"
      });
    }

    return res.json({
      profile: result.rows[0]
    });

  } catch (error) {
    console.error("Doctor profile retrieval failed:", error);

    return res.status(500).json({
      error: "Unable to retrieve doctor profile"
    });
  }
});

// ========================================
// 3. VERIFIED DOCTOR DIRECTORY
// ========================================

router.get(
  "/directory",
  requireRole(
    "patient",
    "community_health_worker",
    "clinician",
    "platform_admin"
  ),
  async (req, res) => {
    const parsed = z.object({
      specialization: z.string().trim().max(150).optional(),
      language: z.string().trim().min(2).max(20).optional()
    }).safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid search parameters"
      });
    }

    try {
      const { specialization, language } = parsed.data;

      const result = await query(
        `SELECT
           d.id,
           d.user_id,
           u.display_name,
           d.registration_council,
           d.registration_number,
           d.specialization,
           d.qualifications,
           d.years_of_experience,
           d.bio,
           d.languages
         FROM doctor_profiles d
         JOIN users u ON u.id = d.user_id
         WHERE d.verification_status = 'verified'
           AND u.status = 'active'
           AND ($1::text IS NULL OR d.specialization ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR $2 = ANY(d.languages))
         ORDER BY u.display_name
         LIMIT 100`,
        [specialization ?? null, language ?? null]
      );

      return res.json({
        count: result.rowCount,
        doctors: result.rows
      });

    } catch (error) {
      console.error("Doctor directory failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve doctor directory"
      });
    }
  }
);

// ========================================
// 4. ADMIN DOCTOR VERIFICATION
// ========================================

const verificationSchema = z.object({
  status: z.enum(["verified", "rejected", "suspended"]),
  rejectionReason: z.string().trim().min(3).max(1000).optional()
}).refine(
  data => data.status !== "rejected" || !!data.rejectionReason,
  {
    message: "A rejection reason is required",
    path: ["rejectionReason"]
  }
);

router.patch(
  "/:doctorId/verification",
  requireRole("platform_admin"),
  async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.doctorId);

    if (!idCheck.success) {
      return res.status(400).json({
        error: "Invalid doctor ID"
      });
    }

    const parsed = verificationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid verification request",
        details: parsed.error.flatten()
      });
    }

    try {
      const doctorId = req.params.doctorId;

      const result = await inTransaction(async client => {
        const updated = await client.query(
          `UPDATE doctor_profiles
           SET
             verification_status = $1::varchar,
             verified_by = CASE
               WHEN $1::varchar = 'verified'::varchar
               THEN $2::uuid
               ELSE NULL::uuid
             END,
             verified_at = CASE
               WHEN $1::varchar = 'verified'::varchar
               THEN NOW()
               ELSE NULL::timestamptz
             END,
             rejection_reason = CASE
               WHEN $1::varchar = 'rejected'::varchar
               THEN $3::text
               ELSE NULL::text
             END,
             updated_at = NOW()
           WHERE id = $4::uuid
           RETURNING *`,
          [
            parsed.data.status,
            req.auth!.userId,
            parsed.data.rejectionReason ?? null,
            doctorId
          ]
        );

        if (!updated.rowCount) {
          return null;
        }

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: `doctor.${parsed.data.status}`,
          targetType: "doctor_profile",
          targetId: String(doctorId)
        });

        return updated.rows[0];
      });

      if (!result) {
        return res.status(404).json({
          error: "Doctor profile not found"
        });
      }

      return res.json({
        message: "Doctor verification status updated",
        profile: result
      });

    } catch (error) {
      console.error("Doctor verification failed:", error);

      return res.status(500).json({
        error: "Unable to update doctor verification"
      });
    }
  }
);

// ========================================
// 5. SAVE DOCTOR WEEKLY AVAILABILITY
// ========================================

const availabilitySchema = z.object({
  periods: z.array(
    z.object({
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(
        /^([01]\d|2[0-3]):[0-5]\d$/,
        "Time must be in HH:MM format"
      ),
      endTime: z.string().regex(
        /^([01]\d|2[0-3]):[0-5]\d$/,
        "Time must be in HH:MM format"
      )
    }).refine(
      period => period.endTime > period.startTime,
      {
        message: "End time must be later than start time",
        path: ["endTime"]
      }
    )
  ).max(28)
});

router.put(
  "/availability",
  requireRole("clinician"),
  async (req, res) => {
    const parsed = availabilitySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid availability schedule",
        details: parsed.error.flatten()
      });
    }

    try {
      const doctor = await query(
        `SELECT id
         FROM doctor_profiles
         WHERE user_id = $1`,
        [req.auth!.userId]
      );

      if (!doctor.rowCount) {
        return res.status(404).json({
          error: "Doctor profile not found"
        });
      }

      const doctorId = doctor.rows[0].id;

      await inTransaction(async client => {

        // Replace the existing weekly schedule.
        await client.query(
          `DELETE FROM doctor_weekly_availability
           WHERE doctor_profile_id = $1`,
          [doctorId]
        );

        // Insert the new working periods.
        for (const period of parsed.data.periods) {
          await client.query(
            `INSERT INTO doctor_weekly_availability
             (doctor_profile_id, day_of_week, start_time, end_time)
             VALUES ($1, $2, $3, $4)`,
            [
              doctorId,
              period.dayOfWeek,
              period.startTime,
              period.endTime
            ]
          );
        }

        await audit(client, {
          actorUserId: req.auth!.userId,
          action: "doctor.availability_updated",
          targetType: "doctor_profile",
          targetId: String(doctorId)
        });
      });

      return res.json({
        message: "Weekly availability updated successfully",
        periods: parsed.data.periods
      });

    } catch (error) {
      const dbError = error as { code?: string };

      if (dbError.code === "23P01") {
        return res.status(409).json({
          error: "Working periods cannot overlap on the same day."
        });
      }

      console.error("Doctor availability update failed:", error);

      return res.status(500).json({
        error: "Unable to update doctor availability"
      });
    }
  }
);

// ========================================
// 6. GET OWN WEEKLY AVAILABILITY
// ========================================

router.get(
  "/availability",
  requireRole("clinician"),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT
           d.id AS doctor_profile_id,
           d.timezone_name,
           a.id AS availability_id,
           a.day_of_week,
           a.start_time,
           a.end_time,
           a.is_active
         FROM doctor_profiles d
         LEFT JOIN doctor_weekly_availability a
           ON a.doctor_profile_id = d.id
         WHERE d.user_id = $1
         ORDER BY a.day_of_week, a.start_time`,
        [req.auth!.userId]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Doctor profile not found"
        });
      }

      return res.json({
        doctorProfileId: result.rows[0].doctor_profile_id,
        timezone: result.rows[0].timezone_name,
        periods: result.rows
          .filter(row => row.availability_id !== null)
          .map(row => ({
            id: row.availability_id,
            dayOfWeek: row.day_of_week,
            startTime: row.start_time,
            endTime: row.end_time,
            isActive: row.is_active
          }))
      });

    } catch (error) {
      console.error("Doctor availability retrieval failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve doctor availability"
      });
    }
  }
);

// ========================================
// 7. PUBLIC DOCTOR AVAILABILITY
// ========================================

router.get(
  "/:doctorId/availability",
  requireRole(
    "patient",
    "community_health_worker",
    "clinician",
    "platform_admin"
  ),
  async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.doctorId);

    if (!idCheck.success) {
      return res.status(400).json({
        error: "Invalid doctor ID"
      });
    }

    try {
      const result = await query(
        `SELECT
           d.id AS doctor_profile_id,
           d.timezone_name,
           a.id AS availability_id,
           a.day_of_week,
           a.start_time,
           a.end_time
         FROM doctor_profiles d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN doctor_weekly_availability a
           ON a.doctor_profile_id = d.id
           AND a.is_active = TRUE
         WHERE d.id = $1
           AND d.verification_status = 'verified'
           AND u.status = 'active'
         ORDER BY a.day_of_week, a.start_time`,
        [req.params.doctorId]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Verified doctor not found"
        });
      }

      return res.json({
        doctorProfileId: result.rows[0].doctor_profile_id,
        timezone: result.rows[0].timezone_name,
        periods: result.rows
          .filter(row => row.availability_id !== null)
          .map(row => ({
            dayOfWeek: row.day_of_week,
            startTime: row.start_time,
            endTime: row.end_time
          }))
      });

    } catch (error) {
      console.error("Public doctor availability failed:", error);

      return res.status(500).json({
        error: "Unable to retrieve doctor availability"
      });
    }
  }
);

export default router;