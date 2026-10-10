// Builds parameterised WHERE clauses and LIMIT/OFFSET for list endpoints.
//
//   const w = where();
//   w.add('status = ?', q.status);           // skipped when the value is undefined/null/''
//   w.raw('o.seller_org_id = ?', ctx.orgId); // always added
//   const { rows, meta } = await paged(db, `select ... from orders o ${w.sql}`, w.params, q, 'o.created_at desc');

export function where(initial = []) {
  const parts = [];
  const params = [...initial];
  const push = (clause, values) => {
    let sql = clause;
    for (const v of values) {
      params.push(v);
      sql = sql.replace('?', `$${params.length}`);
    }
    parts.push(sql);
  };
  return {
    params,
    add(clause, ...values) {
      if (values.some((v) => v === undefined || v === null || v === '')) return this;
      push(clause, values);
      return this;
    },
    raw(clause, ...values) {
      push(clause, values);
      return this;
    },
    get sql() {
      return parts.length ? `where ${parts.join(' and ')}` : '';
    },
    get and() {
      return parts.length ? `and ${parts.join(' and ')}` : '';
    },
  };
}

export async function paged(db, baseSql, params, { page = 1, limit = 25 } = {}, orderBy = 'created_at desc') {
  const offset = (page - 1) * limit;
  const { rows } = await db.query(
    `select q.*, count(*) over () as __total from (${baseSql}) q order by ${orderBy}
     limit ${Number(limit)} offset ${Number(offset)}`,
    params,
  );
  const total = rows[0]?.__total ?? 0;
  for (const r of rows) delete r.__total;
  return { rows, meta: { page, limit, total } };
}
