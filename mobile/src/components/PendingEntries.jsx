import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { describeError } from '../services/api/errors';
import { ActionButton, AppText, Banner, ConfirmDialog, useToast } from './ui';
import { space } from '../theme/theme';

const STATE_TEXT = {
  sending: 'Sending…',
  uncertain: 'Not confirmed. The server did not answer, so this may or may not have been saved.',
  not_saved: 'Checked: the server has not saved this.',
  not_sent: 'Not sent: your session ended. Sign in again, then send it.',
};

/**
 * Entries sent from this phone whose result is not known yet (no answer, server error, session ended). They stay here, even after
 * the app is closed, until the server has confirmed them or you decide. "Check" asks the server whether the entry was saved and changes
 * nothing. "Send again" sends the SAME entry: if the first try had been saved the server just says so, so nothing is counted twice.
 */
export default function PendingEntries({ submissions, entries = submissions.entries }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [discarding, setDiscarding] = useState(null);
  const [note, setNote] = useState(null);
  if (!entries.length && !note) return null;

  const run = async (entry, action) => {
    setBusy(`${entry.id}:${action}`); setNote(null);
    try {
      const out = await (action === 'check' ? submissions.check(entry) : submissions.resend(entry));
      if (out.outcome === 'saved') toast(out.replayed ? 'It had already been saved. Nothing was added twice.' : 'Saved.');
      else if (out.outcome === 'not_saved') setNote({ tone: 'info', title: 'Not saved', text: 'The server has no record of this entry. Send it again, or discard it if it is no longer needed.' });
      else if (out.outcome === 'rejected') setNote({ tone: 'bad', title: 'The server refused this entry', text: `${out.error.message} It has been removed from this list.` });
      else if (out.outcome === 'uncertain' || out.outcome === 'unknown') setNote({ tone: 'risk', title: 'Still not confirmed', text: describeError(out.error, { write: true }).message });
      else if (out.outcome === 'not_sent') setNote({ tone: 'risk', title: 'Not sent', text: STATE_TEXT.not_sent });
    } finally { setBusy(null); }
  };

  return (
    <View style={{ marginBottom: space.md }}>
      {entries.map((entry) => (
        <Banner key={entry.id} tone={entry.state === 'sending' ? 'info' : 'risk'} title={`Unconfirmed: ${entry.label}`}
          text={`${STATE_TEXT[entry.state] ?? STATE_TEXT.uncertain} Entered ${new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`}>
          <View style={styles.actions}>
            <ActionButton compact kind="secondary" label="Check if saved" icon="magnify" loading={busy === `${entry.id}:check`} disabled={!!busy} onPress={() => run(entry, 'check')} />
            <ActionButton compact label="Send again" icon="send" loading={busy === `${entry.id}:resend`} disabled={!!busy} onPress={() => run(entry, 'resend')} />
            {submissions.canDiscard(entry) ? <ActionButton compact kind="destructiveOutline" label="Discard" disabled={!!busy} onPress={() => setDiscarding(entry)} /> : null}
          </View>
          {entry.state !== 'not_saved' ? <AppText variant="caption" style={{ marginTop: space.sm }}>Discard is offered only after "Check if saved" says the server has nothing.</AppText> : null}
        </Banner>
      ))}
      {note ? <Banner tone={note.tone} title={note.title} text={note.text} secondaryAction={{ label: 'Dismiss', onPress: () => setNote(null) }} /> : null}
      <ConfirmDialog visible={!!discarding} destructive title="Discard this entry?" confirmLabel="Discard entry"
        message={discarding ? `"${discarding.label}" will be forgotten. The server has no record of it, so nothing is lost there, but you would have to enter it again.` : ''}
        onCancel={() => setDiscarding(null)} onConfirm={async () => { await submissions.discard(discarding); setDiscarding(null); }} />
    </View>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md } });
