import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

async function main() {
  const migrationPath = path.resolve(process.cwd(), "migrations/001_initial.sql");
  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Database migration 001_initial.sql applied successfully.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
}).finally(async () => pool.end());
