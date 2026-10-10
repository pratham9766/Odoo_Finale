import React, { useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from '../../src/components/Logo';
import { login, recoverPassword } from '../../src/services/auth/authService';
import { palette, serif } from '../../src/theme/theme';

const FOREST_DEEP = '#0d1e1a';
const BUTTON = '#153e35';

/** One input with a leading icon; the border turns gold while it is focused. */
function Field({ icon, right, style, inputRef, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.fieldFocused, style]}>
      <MaterialCommunityIcons name={icon} size={19} color={focused ? palette.gold : '#9ca3af'} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholderTextColor="#b4bac2"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={palette.gold}
        {...props}
      />
      {right}
    </View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hidden, setHidden] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true); setError(null); setNotice(null);
    try { await login(email.trim(), password); }   // the session provider moves us on
    catch (err) { setError(err.message || 'Could not sign in.'); }
    finally { setLoading(false); }
  };

  const forgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setNotice(null); setError('Enter your email above, then tap "Forgot password?" again.'); return; }
    setError(null);
    try { await recoverPassword(email.trim()); setNotice('If that email has an account, a reset link is on its way.'); }
    catch (err) { setError(err.message); }
  };

  return (
    <ImageBackground source={require('../../assets/login-bg.jpg')} style={styles.root} resizeMode="cover">
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['rgba(13,30,26,0.55)', 'rgba(13,30,26,0.92)', FOREST_DEEP]} locations={[0, 0.5, 0.85]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logoRing}><Logo size={46} /></View>
            <Text style={styles.brandName}>sameta</Text>
            <Text style={styles.tag}>EVERY THREAD. CONNECTED.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.title}>Sign in to your{'\n'}workspace</Text>
            <Text style={styles.intro}>Use your team's registered account to keep your operations moving.</Text>

            {error ? (
              <View style={[styles.banner, styles.bannerError]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={palette.danger} />
                <Text style={[styles.bannerText, { color: palette.danger }]}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={[styles.banner, styles.bannerOk]}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={palette.ok} />
                <Text style={[styles.bannerText, { color: palette.ok }]}>{notice}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Work email</Text>
            <Field
              icon="email-outline" placeholder="you@yourmill.com" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} editable={!loading}
              returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <Pressable onPress={forgot} hitSlop={8} disabled={loading}><Text style={styles.forgot}>Forgot password?</Text></Pressable>
            </View>
            <Field
              inputRef={passwordRef} icon="lock-outline" placeholder="••••••••••••" value={password} onChangeText={setPassword}
              secureTextEntry={hidden} autoCapitalize="none" autoComplete="password" editable={!loading}
              returnKeyType="go" onSubmitEditing={submit}
              right={<Pressable onPress={() => setHidden(h => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
                <MaterialCommunityIcons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color="#9ca3af" />
              </Pressable>}
            />

            <Pressable onPress={submit} disabled={loading} style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }, loading && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={styles.buttonText}>Sign in</Text>
                  <MaterialCommunityIcons name="arrow-right" size={19} color={palette.goldBright} />
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.footer}>Textile Operations Platform</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FOREST_DEEP },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22 },
  brand: { alignItems: 'center', marginBottom: 28 },
  logoRing: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(208,175,113,0.45)' },
  brandName: { marginTop: 14, fontSize: 34, fontWeight: '700', color: '#fff', letterSpacing: -0.6 },
  tag: { marginTop: 6, fontSize: 11, letterSpacing: 2.4, fontWeight: '700', color: palette.goldBright },

  card: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 26, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '700', color: '#9ca3af' },
  title: { marginTop: 8, fontSize: 28, lineHeight: 33, fontFamily: serif, fontWeight: '700', color: palette.forest, letterSpacing: -0.4 },
  intro: { marginTop: 10, marginBottom: 20, fontSize: 14, lineHeight: 21, color: palette.textSecondary },

  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, marginBottom: 16 },
  bannerError: { backgroundColor: palette.dangerBg },
  bannerOk: { backgroundColor: palette.okBg },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },

  label: { fontSize: 13, fontWeight: '600', color: palette.ink, marginBottom: 7 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  forgot: { fontSize: 13, fontWeight: '600', color: palette.gold, marginBottom: 7 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafaf8' },
  fieldFocused: { borderColor: palette.gold, backgroundColor: '#fff' },
  input: { flex: 1, height: '100%', fontSize: 15, color: palette.ink, padding: 0 },

  button: { marginTop: 24, height: 52, borderRadius: 12, backgroundColor: BUTTON, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: BUTTON, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.1 },

  footer: { marginTop: 22, textAlign: 'center', fontSize: 12, letterSpacing: 0.6, color: 'rgba(255,255,255,0.5)' },
});
