import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';

export default function ResetPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Reset Password — Messenger-ko';
    }
  }, []);

  const handleSendResetEmail = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setAuthError('');
    if (!cleanEmail) {
      setAuthError('Please enter your registered email address.');
      Alert.alert('Missing Email', 'Please enter your registered email address.');
      return;
    }
    setLoading(true);

    const redirectUrl = typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost')
      ? `${window.location.origin}`
      : 'https://messenger-ko.netlify.app';

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectUrl,
    });

    if (error) {
      setAuthError(error.message);
      Alert.alert('Reset Failed', error.message);
    } else {
      setResetSent(true);
      Alert.alert(
        'Check Your Email 📩',
        `A password reset link has been sent to ${cleanEmail}. Check your inbox or spam folder.`
      );
    }
    setLoading(false);
  };

  const handleUpdatePassword = async () => {
    const cleanPass = newPassword.trim();
    setAuthError('');
    if (!cleanPass || cleanPass.length < 6) {
      setAuthError('New password must be at least 6 characters long.');
      Alert.alert('Weak Password', 'New password must be at least 6 characters long.');
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password: cleanPass });

    if (error) {
      setAuthError(error.message);
      Alert.alert('Update Failed', error.message);
    } else {
      Alert.alert('Password Updated! 🎉', 'Your password has been changed successfully. Log in now!', [
        { text: 'Go to Login', onPress: () => navigation.navigate('Login') },
      ]);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>🔑</Text>
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {resetSent
              ? 'Enter your new password below'
              : 'Enter your email to receive a password recovery link'}
          </Text>
        </View>

        <View style={styles.card}>
          {/* Error Banner */}
          {!!authError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#e53935" style={{ marginRight: 6 }} />
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          )}

          {!resetSent ? (
            <>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Registered Email</Text>
                <TextInput
                  nativeID="reset-email"
                  name="email"
                  style={styles.input}
                  placeholder="user@example.com"
                  placeholderTextColor="#aaa"
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (authError) setAuthError('');
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendResetEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link 📩</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    nativeID="reset-password"
                    name="new-password"
                    style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                    placeholder="Min. 6 characters"
                    placeholderTextColor="#aaa"
                    value={newPassword}
                    onChangeText={(val) => {
                      setNewPassword(val);
                      if (authError) setAuthError('');
                    }}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleUpdatePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Save New Password 🔒</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={styles.footerLink}
        >
          <Text style={styles.footerText}>
            Remembered your password?{' '}
            <Text style={styles.footerHighlight}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f0f4ff' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoIcon: { fontSize: 32, color: '#fff' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ffcdd2',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    color: '#c62828',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputWrapper: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#f7f8fc',
    borderWidth: 1.5,
    borderColor: '#e8eaf0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#1a1a2e',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    backgroundColor: '#f7f8fc',
    borderWidth: 1.5,
    borderLeftWidth: 0,
    borderColor: '#e8eaf0',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#0084ff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerLink: { alignItems: 'center' },
  footerText: { fontSize: 15, color: '#666' },
  footerHighlight: { color: '#0084ff', fontWeight: '700' },
});
