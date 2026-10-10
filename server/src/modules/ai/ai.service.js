import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { aiPool } from '../../db/aiPool.js';
import { withTenant } from '../../db/withTenant.js';
import { env } from '../../config/env.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { guardSql } from './sqlGuard.js';
import { allowedViews } from './views.js';
import { buildSqlSystemPrompt, ANSWER_SYSTEM_PROMPT } from './prompts.js';

const SqlPlan = z.object({
  can_answer: z.boolean(),
  reason_if_not: z.string(),
  sql: z.string(),
  chart: z.object({ type: z.enum(['bar', 'line', 'pie', 'table', 'kpi']), x: z.string(), y: z.string() }),
  explanation: z.string(),
});

let client;
const gemini = () => {
  if (!env.GEMINI_API_KEY) throw new AppError(503, 'AI_CANNOT_ANSWER', 'The AI assistant is not configured on this server');
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
};

// chat history uses our roles; Gemini calls the assistant 'model'
const toContents = (messages) => messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

// ---- default model calls (replaceable in tests) ----

async function planWithModel({ views, history, question, retryNote }) {
  const messages = [...history, { role: 'user', content: question }];
  if (retryNote) messages.push({ role: 'assistant', content: retryNote.previous }, { role: 'user', content: retryNote.error });
  const res = await gemini().models.generateContent({
    model: env.AI_MODEL,
    contents: toContents(messages),
    config: {
      systemInstruction: buildSqlSystemPrompt(views, new Date()),
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(SqlPlan),
      temperature: 0,
      maxOutputTokens: 2000,
    },
  });
  if (!res.text) throw new AppError(422, 'AI_CANNOT_ANSWER', 'The assistant declined this question');
  let json;
  try { json = JSON.parse(res.text); } catch { json = null; }
  const parsed = SqlPlan.safeParse(json);
  if (!parsed.success) throw new AppError(422, 'AI_CANNOT_ANSWER', 'The assistant returned an unusable plan');
  return parsed.data;
}

async function answerWithModel({ question, rows }) {
  const res = await gemini().models.generateContent({
    model: env.AI_MODEL,
    contents: [{
      role: 'user',
      parts: [{ text: `Question: ${question}\n\nQuery result (JSON, up to 200 rows):\n${JSON.stringify(rows.slice(0, 200))}` }],
    }],
    config: { systemInstruction: ANSWER_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: 600 },
  });
  return (res.text ?? '').trim() || 'No answer could be written for this result.';
}

// ---- read-only execution as ai_reader ----

export async function runReadOnly(ctx, sql) {
  const client = await aiPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("select set_config('app.org_id', $1, true), set_config('statement_timeout', '5000', true)", [ctx.orgId]);
    const { rows } = await client.query(sql);
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * question -> structured SQL plan -> guard -> read-only run (one self-correction retry) -> short answer.
 * `deps` lets tests swap the two model calls; production uses Gemini.
 */
export async function ask(ctx, { question, history = [] }, deps = { plan: planWithModel, answer: answerWithModel }) {
  const views = allowedViews(ctx);
  if (views.length === 0) throw new AppError(403, 'FORBIDDEN', 'You have no data the assistant can use');

  const plan = await deps.plan({ views, history, question });
  if (!plan || !plan.can_answer) {
    return { answer: plan?.reason_if_not || 'I cannot answer that from the data you can access.', rows: [], chart: null, sql: null };
  }

  let sql = guardSql(plan.sql, views); // unsafe SQL is rejected outright, never "corrected"
  let rows;
  try {
    rows = await runReadOnly(ctx, sql);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const retry = await deps.plan({ views, history, question, retryNote: { previous: JSON.stringify(plan), error: `That SQL failed with: ${err.message}. Return a corrected plan.` } });
    if (!retry?.can_answer) throw new AppError(422, 'AI_CANNOT_ANSWER', 'Could not build a working query');
    Object.assign(plan, retry);
    sql = guardSql(plan.sql, views);
    rows = await runReadOnly(ctx, sql);
  }
  const answer = await deps.answer({ question, rows });
  return { answer, rows, chart: plan.chart, sql: plan.sql };
}

// ---------- chats (app_user, tenant-scoped) ----------

export const listChats = (ctx) =>
  withTenant(ctx, async (db) => (await db.query(
    `select id, title, created_at from ai_chats where user_id = $1 order by created_at desc limit 50`, [ctx.userId])).rows);

export const getChat = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rows: [c] } = await db.query('select id, title, created_at from ai_chats where id = $1 and user_id = $2', [id, ctx.userId]);
    must(c, 'Chat');
    const { rows: messages } = await db.query(
      'select id, role, content, sql, result, chart, created_at from ai_messages where chat_id = $1 order by created_at', [id]);
    return { ...c, messages };
  });

export async function chat(ctx, { chat_id, question }, deps) {
  // history: last 6 messages of this chat (text only)
  const history = await withTenant(ctx, async (db) => {
    if (!chat_id) return [];
    const { rows: [c] } = await db.query('select id from ai_chats where id = $1 and user_id = $2', [chat_id, ctx.userId]);
    must(c, 'Chat');
    const { rows } = await db.query('select role, content from ai_messages where chat_id = $1 order by created_at desc limit 6', [chat_id]);
    return rows.reverse();
  });

  const result = await ask(ctx, { question, history }, deps);

  return withTenant(ctx, async (db) => {
    let id = chat_id;
    if (!id) {
      const { rows: [c] } = await db.query(`insert into ai_chats (org_id, user_id, title) values ($1,$2,$3) returning id`,
        [ctx.orgId, ctx.userId, question.slice(0, 80)]);
      id = c.id;
    }
    await db.query(`insert into ai_messages (org_id, chat_id, role, content) values ($1,$2,'user',$3)`, [ctx.orgId, id, question]);
    await db.query(
      `insert into ai_messages (org_id, chat_id, role, content, sql, result, chart) values ($1,$2,'assistant',$3,$4,$5,$6)`,
      [ctx.orgId, id, result.answer, result.sql, JSON.stringify(result.rows.slice(0, 200)), result.chart ? JSON.stringify(result.chart) : null]);
    return { chat_id: id, ...result };
  });
}

// ---------- insights (read side) ----------

export const listInsights = (ctx) =>
  withTenant(ctx, async (db) => (await db.query(
    `select id, type, severity, title, body, data, created_at from ai_insights
      where dismissed_at is null and (required_permission is null or required_permission = any($1::text[]))
      order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, created_at desc limit 30`,
    [[...ctx.permissions]])).rows);

export const dismissInsight = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rowCount } = await db.query(
      `update ai_insights set dismissed_at = now() where id = $1 and dismissed_at is null and (required_permission is null or required_permission = any($2::text[]))`,
      [id, [...ctx.permissions]]);
    if (!rowCount) throw notFound('Insight');
    return { id };
  });
