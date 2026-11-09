import { PoolClient } from "pg";

export async function audit(
  client: PoolClient,
  input: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    serviceAreaId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, service_area_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.actorUserId ?? null, input.action, input.targetType, input.targetId ?? null,
      input.serviceAreaId ?? null, JSON.stringify(input.metadata ?? {})]
  );
}
