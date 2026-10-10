export async function audit(db, ctx, { action, table, id = null, before = null, after = null }) {
  await db.query(
    `insert into audit_logs (org_id, user_id, action, table_name, record_id, before, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [ctx.orgId, ctx.userId ?? null, action, table, id, before, after],
  );
}
