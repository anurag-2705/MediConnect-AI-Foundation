import { Router } from "express";
import { z } from "zod";
import { query } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = z.object({
    parentId: z.string().uuid().optional(),
    level: z.enum(["state", "district", "block", "village"]).optional()
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid service-area filter" });

  const values: unknown[] = [];
  const filters = ["is_active = true"];
  if (parsed.data.parentId) {
    values.push(parsed.data.parentId);
    filters.push(`parent_id = $${values.length}`);
  }
  if (parsed.data.level) {
    values.push(parsed.data.level);
    filters.push(`level = $${values.length}`);
  }
  values.push(100);
  const result = await query(
    `SELECT id, parent_id AS "parentId", level, code, name
     FROM service_areas WHERE ${filters.join(" AND ")}
     ORDER BY name LIMIT $${values.length}`,
    values
  );
  return res.json({ serviceAreas: result.rows });
});

export default router;
