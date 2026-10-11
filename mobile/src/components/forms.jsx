import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MAX_FONT_SCALE, TOUCH, palette, radius, space, type } from '../theme/theme';

/** The app's text: scales with the system font size up to a limit, so long labels wrap instead of breaking the layout. */
export const AppText = ({ variant = 'body', style, ...props }) => <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type[variant], style]} {...props} />;

const KINDS = {
  primary: { bg: palette.forest, fg: '#FFFFFF', border: palette.forest },
  secondary: { bg: '#FFFFFF', fg: palette.forest, border: palette.forest },
  destructive: { bg: palette.danger, fg: '#FFFFFF', border: palette.danger },
  destructiveOutline: { bg: '#FFFFFF', fg: palette.danger, border: palette.danger },
  text: { bg: 'transparent', fg: palette.forest, border: 'transparent' },
};

/**
 * The one button. At least 48 dp tall, a text label always (an icon never stands alone), a spinner and "disabled" while busy so a
 * second tap cannot send the same thing twice.
 * kind: primary | secondary | destructive | destructiveOutline | text
 */
export function ActionButton({ label, onPress, kind = 'primary', icon, loading = false, disabled = false, compact = false, style, accessibilityHint }) {
  const k = KINDS[kind];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: loading }}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      style={({ pressed }) => [styles.button, compact && styles.buttonCompact, { backgroundColor: k.bg, borderColor: k.border }, off && styles.off, pressed && !off && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={k.fg} /> : icon ? <MaterialCommunityIcons name={icon} size={20} color={k.fg} /> : null}
      <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buttonText, { color: k.fg }]} numberOfLines={2}>{label}</RNText>
    </Pressable>
  );
}

/**
 * A labelled input with an optional unit (m, kg), helper text and an error line. The label stays visible above the field, so it is
 * still readable while typing, and it is what a screen reader announces. `number` shows the decimal keypad.
 */
export function Field({ label, value, onChangeText, error, helper, unit, number, multiline, optional, editable = true, placeholder, autoFocus, autoCapitalize, returnKeyType, onSubmitEditing, inputRef, maxLength, style }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.fieldWrap, style]}>
      <AppText variant="label">{label}{optional ? <AppText variant="caption">  (optional)</AppText> : null}</AppText>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError, !editable && styles.fieldOff]}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          keyboardType={number ? 'decimal-pad' : 'default'}
          multiline={multiline}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={palette.forest}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          accessibilityLabel={`${label}${unit ? `, in ${unit}` : ''}${optional ? ', optional' : ''}`}
          accessibilityHint={helper}
          style={[styles.input, multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]}
        />
        {unit ? <AppText variant="small" style={styles.unit}>{unit}</AppText> : null}
      </View>
      {error ? (
        <View style={styles.msgRow} accessibilityLiveRegion="polite"><MaterialCommunityIcons name="alert-circle-outline" size={16} color={palette.danger} /><AppText variant="small" style={{ color: palette.danger, flex: 1 }}>{error}</AppText></View>
      ) : helper ? <AppText variant="caption" style={{ marginTop: 4 }}>{helper}</AppText> : null}
    </View>
  );
}

/** Search box: 48 dp, a visible clear button, submits from the keyboard. */
export function SearchBar({ value, onChangeText, onSubmit, placeholder = 'Search', autoCapitalize = 'none' }) {
  return (
    <View style={styles.search} accessibilityRole="search">
      <MaterialCommunityIcons name="magnify" size={22} color={palette.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value.trim())}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        returnKeyType="search"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable onPress={() => { onChangeText(''); onSubmit?.(''); }} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} style={styles.clear}>
          <MaterialCommunityIcons name="close-circle" size={22} color={palette.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A confirmation before something consequential. States what will happen; the confirm button repeats the action ("Reject roll"),
 * not "OK". Android back and tapping outside cancel it, except while the action is running.
 */
export function ConfirmDialog({ visible, title, message, confirmLabel, destructive = false, loading = false, onConfirm, onCancel, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={loading ? undefined : onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel} accessibilityLabel="Close dialog" accessibilityRole="button">
          <Pressable style={styles.dialog} accessibilityViewIsModal onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <AppText variant="h2" accessibilityRole="header">{title}</AppText>
              {message ? <AppText variant="body" style={{ marginTop: space.sm }}>{message}</AppText> : null}
              {children ? <View style={{ marginTop: space.md }}>{children}</View> : null}
              <View style={styles.dialogActions}>
                <ActionButton label="Cancel" kind="text" onPress={onCancel} disabled={loading} />
                <ActionButton label={confirmLabel} kind={destructive ? 'destructive' : 'primary'} onPress={onConfirm} loading={loading} />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH, paddingHorizontal: space.lg, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonCompact: { minHeight: 44, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  off: { opacity: 0.5 },
  fieldWrap: { marginBottom: space.md },
  field: { marginTop: 6, minHeight: TOUCH, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.linen, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  fieldFocused: { borderColor: palette.forest },
  fieldError: { borderColor: palette.danger },
  fieldOff: { backgroundColor: palette.cream },
  input: { flex: 1, fontSize: 17, color: palette.ink, paddingVertical: 10 },
  unit: { marginLeft: space.sm },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  search: { minHeight: TOUCH, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.linen, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, gap: space.sm, marginBottom: space.md },
  searchInput: { flex: 1, fontSize: 16, color: palette.ink, paddingVertical: 10 },
  clear: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,60,50,0.55)', justifyContent: 'center', padding: space.xl },
  dialog: { backgroundColor: '#fff', borderRadius: radius.lg, padding: space.xl, width: '100%', maxWidth: 480, maxHeight: '88%', alignSelf: 'center' },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xl, flexWrap: 'wrap' },
});
