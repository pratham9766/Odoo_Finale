import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '../context/Session';
import { useAction, useSubmissions } from '../lib/hooks';
import { describeError } from '../services/api/errors';
import { quantity } from '../utils/format';
import { space } from '../theme/theme';
import PendingEntries from './PendingEntries';
import { ActionButton, AppText, Banner, ConfirmDialog, Field, Panel, Section, useToast } from './ui';

const decimals = (n) => Math.abs(Math.round(n * 1000) / 1000 - n) < 1e-9;
const parseNumber = (text) => Number(String(text).trim().replace(',', '.'));

/**
 * The floor actions of one work order, in separate steps:
 *   1. State     start / pause / resume / finish          (only the actions valid for the current state are shown)
 *   2. Output    log what the machine produced            (a quantity added to the work order; NOT a roll)
 *   3. Roll      register a physical roll of fabric       (a separate record that goes to quality control)
 * `wo` is the work order as the API returns it (id, wo_no, status, uom, produced_qty, target_qty).
 */
export default function WorkOrderActions({ wo }) {
  const { can } = useSession();
  const submissions = useSubmissions(wo.id);
  if (!can('production.log')) return <Banner tone="info" title="View only" text="Your role can see this work order but not change it." />;
  return (
    <>
      <PendingEntries submissions={submissions} />
      <StateActions wo={wo} />
      {wo.status === 'running' ? <OutputSection wo={wo} submissions={submissions} /> : <Section title="Log output"><Panel><AppText variant="small">Output can be logged while the work order is running{wo.status === 'planned' ? '. Start it first.' : wo.status === 'paused' ? '. Resume it first.' : '.'}</AppText></Panel></Section>}
      {['running', 'paused', 'done'].includes(wo.status) ? <RollSection wo={wo} submissions={submissions} /> : null}
    </>
  );
}

// ---- 1. state ---------------------------------------------------------------------------------------------------------

function StateActions({ wo }) {
  const act = useAction();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);       // 'pause' | 'finish'
  const [reason, setReason] = useState('');
  const [good, setGood] = useState('');
  const [waste, setWaste] = useState('');
  const [error, setError] = useState(null);
  const s = wo.status;
  const post = (path, body, done) => act.mutate({ path: `/work-orders/${wo.id}/${path}`, body, quiet: true }, {
    onSuccess: () => { setDialog(null); setError(null); setReason(''); setGood(''); setWaste(''); toast(done); },   // typed values are cleared only once the server has accepted them
    onError: (e) => { setDialog(null); const i = describeError(e, { write: true }); setError(i.uncertain ? { title: 'Not confirmed', text: 'The server did not answer. Pull down to refresh and check the status before trying again.' } : { title: i.title, text: e.message }); },
  });
  if (s === 'done' || s === 'cancelled') return null;
  const finishValid = good.trim() !== '' && parseNumber(good) >= 0 && decimals(parseNumber(good)) && (waste.trim() === '' || (parseNumber(waste) >= 0 && decimals(parseNumber(waste))));

  return (
    <Section title="Work order status" note={{ planned: 'Not started yet.', running: 'Running. Pause it when the machine stops.', paused: 'Paused. Resume to log output again.' }[s]}>
      {error ? <Banner tone="bad" title={error.title} text={error.text} secondaryAction={{ label: 'Dismiss', onPress: () => setError(null) }} /> : null}
      <View style={{ gap: space.md }}>
        {s === 'planned' && <ActionButton label="Start work order" icon="play-circle-outline" loading={act.isPending} onPress={() => post('start', undefined, `${wo.wo_no} started.`)} />}
        {s === 'paused' && <ActionButton label="Resume work order" icon="play-circle-outline" loading={act.isPending} onPress={() => post('resume', undefined, `${wo.wo_no} resumed.`)} />}
        {s === 'running' && <ActionButton kind="secondary" label="Pause work order" icon="pause-circle-outline" disabled={act.isPending} onPress={() => setDialog('pause')} />}
        {(s === 'running' || s === 'paused') && <ActionButton kind="destructiveOutline" label="Finish work order" icon="flag-checkered" disabled={act.isPending} onPress={() => setDialog('finish')} />}
      </View>

      <ConfirmDialog visible={dialog === 'pause'} title={`Pause ${wo.wo_no}?`} confirmLabel="Pause" loading={act.isPending} onCancel={() => setDialog(null)}
        onConfirm={() => post('pause', reason.trim() ? { reason: reason.trim() } : {}, `${wo.wo_no} paused.`)} message="Output cannot be logged while it is paused.">
        <Field label="Reason" optional value={reason} onChangeText={setReason} maxLength={200} helper="For example: yarn change, power cut" />
      </ConfirmDialog>

      <ConfirmDialog visible={dialog === 'finish'} destructive title={`Finish ${wo.wo_no}?`} confirmLabel="Finish work order" loading={act.isPending} onCancel={() => setDialog(null)}
        onConfirm={() => finishValid ? post('finish', { good_qty: parseNumber(good), waste_qty: waste.trim() ? parseNumber(waste) : 0 }, `${wo.wo_no} finished.`) : setError({ title: 'Check the quantities', text: 'Enter the good output (up to 3 decimals). Waste is optional.' })}
        message={`Logged so far: ${quantity(wo.produced_qty)} of ${quantity(wo.target_qty)} ${wo.uom}. Finishing closes the work order and moves its output to stock.`}>
        <Field label="Good output" number unit={wo.uom} value={good} onChangeText={setGood} helper="What passed to the next step" error={good.trim() && !finishValid ? 'Enter a number, up to 3 decimals.' : undefined} />
        <Field label="Waste" number optional unit={wo.uom} value={waste} onChangeText={setWaste} />
      </ConfirmDialog>
    </Section>
  );
}

// ---- 2. output --------------------------------------------------------------------------------------------------------

function OutputSection({ wo, submissions }) {
  const { can, userId } = useSession();
  const toast = useToast();
  const draftName = `${wo.id}.log`;
  const [qty, setQty] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [review, setReview] = useState(false);
  const [over, setOver] = useState(null);           // an OVER_TARGET refusal: { details, qty }
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const loaded = useRef(false);

  // the draft belongs to this person and this work order; it is restored after a restart and cleared once saved
  useEffect(() => { loaded.current = false; submissions.drafts.get(draftName).then((d) => { if (d?.qty) setQty(d.qty); loaded.current = true; }); }, [draftName, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded.current) submissions.drafts.put(draftName, { qty }); }, [qty]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = parseNumber(qty);
  const valid = qty.trim() !== '' && Number.isFinite(n) && n > 0 && decimals(n);
  const total = valid ? Number(wo.produced_qty) + n : null;
  const unconfirmed = submissions.entries.some((e) => e.operation === 'production.log' && e.state !== 'not_saved');

  const check = () => {
    setError(null); setDone(null);
    if (!valid) { setError(!qty.trim() ? 'Enter how much was produced.' : n > 0 ? 'Use at most 3 decimal places.' : 'Enter a number above zero.'); return; }
    setReview(true);
  };

  const send = async (extra = {}) => {
    setSending(true);
    const out = await submissions.begin({
      operation: 'production.log', path: `/work-orders/${wo.id}/logs`, body: { qty: n, ...extra },
      label: `${quantity(n)} ${wo.uom} on ${wo.wo_no}`, subjectId: wo.id,
    });
    setSending(false); setReview(false);
    if (out.outcome === 'saved') {
      await submissions.drafts.clear(draftName); setQty(''); setReason(''); setOver(null);
      setDone({ text: `Recorded ${quantity(n)} ${wo.uom}. Work order total: ${quantity(out.data.work_order.produced_qty)} of ${quantity(out.data.work_order.target_qty)} ${wo.uom}.`, replayed: out.replayed });
      toast('Output recorded.');
    } else if (out.outcome === 'rejected') {
      if (out.error.details?.over_target) setOver({ details: out.error.details.over_target, message: out.error.message, qty: n });
      else setError(out.info.message);
    } else if (out.outcome === 'not_sent') setError(out.info.message);
    // uncertain: the entry is now listed under "Unconfirmed" above, with its recovery actions
  };

  return (
    <Section title="Log output" note={`Add what the machine produced since your last entry. This is a quantity (${wo.uom}), not a roll.`}>
      <Panel>
        <AppText variant="small">So far: <AppText variant="bodyStrong">{quantity(wo.produced_qty)}</AppText> of {quantity(wo.target_qty)} {wo.uom}</AppText>
        <View style={{ height: space.md }} />
        <Field label="Output to add" number unit={wo.uom} value={qty} onChangeText={(t) => { setQty(t); setError(null); }} error={error}
          helper={valid ? `Total will be ${quantity(total)} of ${quantity(wo.target_qty)} ${wo.uom}` : 'Only what is new since the last entry'} editable={!sending} />
        {done ? <Banner tone="ok" title={done.replayed ? 'Already recorded' : 'Saved'} text={`${done.text}${done.replayed ? ' (The first attempt had already been saved; nothing was added twice.)' : ''}`} /> : null}
        {over ? (
          <Banner tone="bad" title="Above the allowed output" text={over.message}>
            {over.details.override_allowed && can('production.plan')
              ? <ActionButton compact kind="secondary" label="Confirm anyway (supervisor)" onPress={() => setReview('over')} style={{ marginTop: space.md }} />
              : <AppText variant="small" style={{ marginTop: space.sm }}>{over.details.override_allowed ? 'Check the number. If it is right, ask a supervisor to confirm it.' : 'Check the number. Output above the limit cannot be logged.'}</AppText>}
          </Banner>
        ) : null}
        <ActionButton label={unconfirmed ? 'Resolve the unconfirmed entry first' : 'Review and add output'} icon="plus-circle-outline" onPress={check} disabled={sending || unconfirmed} loading={sending} />
        {unconfirmed ? <AppText variant="caption" style={{ marginTop: space.sm }}>An earlier entry is not confirmed yet. Settle it above so the same output is not entered twice.</AppText> : null}
      </Panel>

      <ConfirmDialog visible={review === true} title={`Add ${valid ? quantity(n) : ''} ${wo.uom} to ${wo.wo_no}?`} confirmLabel="Add output" loading={sending} onCancel={() => setReview(false)} onConfirm={() => send()}
        message={`The work order total becomes ${valid ? quantity(total) : ''} of ${quantity(wo.target_qty)} ${wo.uom}. A supervisor is needed to correct it afterwards.`} />
      <ConfirmDialog visible={review === 'over'} title="Confirm output above the limit" confirmLabel="Confirm and add" loading={sending} onCancel={() => setReview(false)}
        onConfirm={() => (reason.trim().length >= 3 ? send({ confirm_over_target: true, reason: reason.trim() }) : setError('Give a reason of a few words.'))}
        message={over ? `This brings ${wo.wo_no} to ${quantity(over.details.would_be)} ${wo.uom}; the limit is ${quantity(over.details.limit)}. It is recorded in the audit log with your name and reason.` : ''}>
        <Field label="Reason" value={reason} onChangeText={setReason} maxLength={200} error={error} />
      </ConfirmDialog>
    </Section>
  );
}

// ---- 3. roll ----------------------------------------------------------------------------------------------------------

function RollSection({ wo, submissions }) {
  const { userId } = useSession();
  const toast = useToast();
  const draftName = `${wo.id}.roll`;
  const [form, setForm] = useState({ length: '', weight: '', dye: '' });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const [problem, setProblem] = useState(null);
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const loaded = useRef(false);
  useEffect(() => { loaded.current = false; submissions.drafts.get(draftName).then((d) => { if (d) setForm((f) => ({ ...f, ...d })); loaded.current = true; }); }, [draftName, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded.current) submissions.drafts.put(draftName, form); }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const unconfirmed = submissions.entries.some((e) => e.operation === 'roll.create' && e.state !== 'not_saved');

  const check = () => {
    const e = {};
    const len = parseNumber(form.length); const wt = parseNumber(form.weight);
    if (!(len > 0 && len <= 10000)) e.length = 'Enter the roll length in metres (up to 10,000).';
    else if (!decimals(len)) e.length = 'Use at most 3 decimal places.';
    if (form.weight.trim() && !(wt > 0 && wt <= 10000)) e.weight = 'Enter the weight in kg, or leave it empty.';
    setErrors(e); setDone(null); setProblem(null);
    if (!Object.keys(e).length) setReview(true);
  };

  const send = async () => {
    setSending(true);
    const body = { work_order_id: wo.id, length_m: parseNumber(form.length), ...(form.weight.trim() ? { weight_kg: parseNumber(form.weight) } : {}), ...(form.dye.trim() ? { dye_batch: form.dye.trim() } : {}) };
    const out = await submissions.begin({ operation: 'roll.create', path: '/rolls', body, label: `New roll of ${quantity(body.length_m)} m on ${wo.wo_no}`, subjectId: wo.id });
    setSending(false); setReview(false);
    if (out.outcome === 'saved') {
      await submissions.drafts.clear(draftName); setForm({ length: '', weight: '', dye: '' });
      setDone({ roll: out.data, replayed: out.replayed });
      toast(`Roll ${out.data.roll_no} created.`);
    } else if (out.outcome === 'rejected' || out.outcome === 'not_sent') setProblem(out.info.message);
  };

  return (
    <Section title="Create a roll" note="A roll is a physical piece of finished fabric. It is a separate record from output: it is numbered, labelled and sent to quality control.">
      <Panel>
        <Field label="Length" number unit="m" value={form.length} onChangeText={set('length')} error={errors.length} editable={!sending} />
        <Field label="Weight" number optional unit="kg" value={form.weight} onChangeText={set('weight')} error={errors.weight} editable={!sending} />
        <Field label="Dye batch" optional value={form.dye} onChangeText={set('dye')} maxLength={40} editable={!sending} />
        {problem ? <Banner tone="bad" title="Roll not created" text={problem} /> : null}
        {done ? <Banner tone="ok" title={done.replayed ? 'Roll already created' : `Roll ${done.roll.roll_no} created`} text={`${quantity(done.roll.length_m)} m, waiting for quality control.${done.replayed ? ' (The first attempt had already been saved.)' : ''}`} /> : null}
        <ActionButton kind="secondary" label={unconfirmed ? 'Resolve the unconfirmed roll first' : 'Review and create roll'} icon="paper-roll-outline" onPress={check} disabled={sending || unconfirmed} loading={sending} />
      </Panel>
      <ConfirmDialog visible={review} title={`Create a roll of ${quantity(parseNumber(form.length))} m?`} confirmLabel="Create roll" loading={sending} onCancel={() => setReview(false)} onConfirm={send}
        message={`It gets the next roll number for the order of ${wo.wo_no} and goes to the QC queue. Only a QC head can change it afterwards.`} />
    </Section>
  );
}
