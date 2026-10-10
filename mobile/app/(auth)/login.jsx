import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import { Link } from 'expo-router';
import { login } from '../../src/services/auth/authService';

export default function LoginScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      // Integration is missing, this will throw
    } catch (err) {
      setError(err.message || 'An error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: theme.colors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.container}>
          <View style={styles.logoContainer}>
            <Text variant="headlineLarge" style={[styles.logoText, { color: theme.colors.primary }]}>SAMETA</Text>
            <Text variant="titleLarge" style={styles.title}>Welcome back</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>Sign in to your workspace</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              label="Work email"
              mode="outlined"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={styles.input}
              disabled={loading}
            />
            
            <TextInput
              label="Password"
              mode="outlined"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secureText}
              right={<TextInput.Icon icon={secureText ? "eye" : "eye-off"} onPress={() => setSecureText(!secureText)} />}
              style={styles.input}
              disabled={loading}
            />
            
            {error && (
              <HelperText type="error" visible={!!error} style={styles.errorText}>
                {error}
              </HelperText>
            )}

            <Button mode="text" style={styles.forgotButton} labelStyle={{ color: theme.colors.primary }}>
              Forgot password?
            </Button>

            <Button 
              mode="contained" 
              onPress={handleLogin} 
              loading={loading}
              disabled={loading}
              style={styles.submitButton}
              contentStyle={styles.submitButtonContent}
            >
              Sign in
            </Button>

            <View style={styles.footer}>
              <Text variant="bodyMedium">New to SAMETA? </Text>
              <Link href="/signup" asChild>
                <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Create account</Text>
              </Link>
            </View>
            
            <Text variant="bodySmall" style={styles.tagline}>
              One platform connecting vendors, customers, and commerce.
            </Text>

            {__DEV__ && (
              <Link href="/(app)/(tabs)/dashboard" asChild>
                <Button mode="outlined" style={{ marginTop: 24, borderColor: theme.colors.primary }} textColor={theme.colors.primary}>
                  Dev Preview: Bypass Login
                </Button>
              </Link>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: -1,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.6,
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    marginBottom: 8,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  submitButton: {
    borderRadius: 8,
    marginBottom: 32,
  },
  submitButtonContent: {
    height: 48,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  tagline: {
    textAlign: 'center',
    opacity: 0.5,
  }
});
