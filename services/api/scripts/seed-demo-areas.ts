import { randomUUID } from "node:crypto";
import { inTransaction, pool } from "../src/db";

async function main() {
  const ids = { state: randomUUID(), district: randomUUID(), block: randomUUID(), village: randomUUID() };
  await inTransaction(async (client) => {
    const existing = await client.query("SELECT id FROM service_areas WHERE code = 'DEMO-STATE'");
    if (existing.rows[0]) {
      console.log("Demo service areas already exist; no changes made.");
      return;
    }
    await client.query("INSERT INTO service_areas (id, parent_id, level, code, name) VALUES ($1, NULL, 'state', 'DEMO-STATE', 'Demo State')", [ids.state]);
    await client.query("INSERT INTO service_areas (id, parent_id, level, code, name) VALUES ($1, $2, 'district', 'DEMO-DISTRICT', 'Demo District')", [ids.district, ids.state]);
    await client.query("INSERT INTO service_areas (id, parent_id, level, code, name) VALUES ($1, $2, 'block', 'DEMO-BLOCK', 'Demo Block')", [ids.block, ids.district]);
    await client.query("INSERT INTO service_areas (id, parent_id, level, code, name) VALUES ($1, $2, 'village', 'DEMO-VILLAGE', 'Demo Village')", [ids.village, ids.block]);
    console.log("Created fictional demo hierarchy:", ids);
  });
}

main().catch((error) => {
  console.error("Demo seed failed:", error);
  process.exitCode = 1;
}).finally(async () => pool.end());
