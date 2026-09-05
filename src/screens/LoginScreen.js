import React, { useState, useEffect, useRef } from 'react';
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

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Messenger-ko';
      try {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'shortcut icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = '/favicon.png';
      } catch (e) {}
    }
  }, []);

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    setAuthError('');

    if (!cleanEmail || !cleanPass) {
      setAuthError('Please enter your email and password.');
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (error) {
      const errMsg = error.message || '';
      if (errMsg.toLowerCase().includes('email not confirmed')) {
        const notConfirmedMsg = 'Email not confirmed. Please check your email inbox to verify your account, or turn off "Confirm Email" in Supabase Auth settings.';
        setAuthError(notConfirmedMsg);
        Alert.alert(
          'Email Not Confirmed ✉️',
          `Account ${cleanEmail} needs email confirmation before logging in.\n\nWould you like to resend the confirmation email?`,
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Resend Email 📩',
              onPress: async () => {
                const { error: resendErr } = await supabase.auth.resend({
                  type: 'signup',
                  email: cleanEmail,
                });
                if (resendErr) {
                  Alert.alert('Resend Error', resendErr.message);
                } else {
                  Alert.alert('Confirmation Sent! 📩', `A new confirmation link was sent to ${cleanEmail}. Check your inbox.`);
                }
              },
            },
          ]
        );
      } else if (
        errMsg.toLowerCase().includes('invalid login credentials') ||
        errMsg.toLowerCase().includes('user_not_found') ||
        errMsg.toLowerCase().includes('invalid credentials')
      ) {
        setAuthError('Invalid email or password. Please check your credentials or create an account.');
        Alert.alert(
          'Account Not Found or Invalid Password',
          `Could not log in as ${cleanEmail}.\n\nWould you like to create a new account with this email and password?`,
          [
            { text: 'Try Again', style: 'cancel' },
            {
              text: 'Create Account 🚀',
              onPress: () => handleAutoSignUp(cleanEmail, cleanPass),
            },
          ]
        );
      } else {
        setAuthError(error.message);
        Alert.alert('Login Failed', error.message);
      }
    }
    setLoading(false);
  };

  const handleAutoSignUp = async (cleanEmail, cleanPass) => {
    if (cleanPass.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    setAuthError('');

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        data: { full_name: cleanEmail.split('@')[0] },
      },
    });

    if (error) {
      if (error.status === 429 || error.message.toLowerCase().includes('3 seconds') || error.message.toLowerCase().includes('rate_limit')) {
        setAuthError('Please wait 3 seconds before sending another signup request.');
        Alert.alert('Please Wait ⏳', 'For security, please wait 3 seconds before sending another signup request.');
      } else {
        setAuthError(error.message);
        Alert.alert('Registration Error', error.message);
      }
    } else if (data.session) {
      Alert.alert('Welcome! 🎉', 'Account created and logged in successfully!');
    } else {
      Alert.alert(
        'Account Created! 🎉',
        `Account created for ${cleanEmail}.\nIf email confirmation is required, please verify your inbox or log in now.`
      );
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
        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <Text style={styles.appName}>Messenger-ko</Text>
          <Text style={styles.tagline}>Connected with you, anywhere 💖</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>

          {/* Error Banner */}
          {!!authError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#e53935" style={{ marginRight: 6 }} />
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              ref={emailRef}
              nativeID="login-email"
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
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')} disabled={loading}>
                <Text style={{ fontSize: 12, color: '#0084ff', fontWeight: '600' }}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.passwordContainer}>
              <TextInput
                ref={passwordRef}
                nativeID="login-password"
                name="password"
                style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                placeholder="••••••••"
                placeholderTextColor="#aaa"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (authError) setAuthError('');
                }}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
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
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Navigation to Create Account / Register */}
        <TouchableOpacity
          style={styles.footerRegisterLink}
          onPress={() => navigation.navigate('Register')}
          disabled={loading}
        >
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Text style={styles.footerHighlight}>Create Account</Text>
          </Text>
        </TouchableOpacity>

        <View style={[styles.footerLink, { marginTop: 16 }]}>
          <Text style={styles.footerSubtext}>
            Created by <Text style={styles.footerSubHighlight}>Karl Nicko Alondra</Text>
          </Text>
        </View>
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
  logoArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0084ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoIcon: { fontSize: 44, color: '#fff' },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 6,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 18,
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
    shadowColor: '#0084ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerRegisterLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 15,
    color: '#555',
  },
  footerHighlight: {
    color: '#0084ff',
    fontWeight: '700',
  },
  footerLink: {
    alignItems: 'center',
  },
  footerSubtext: {
    fontSize: 13,
    color: '#888',
  },
  footerSubHighlight: {
    color: '#0084ff',
    fontWeight: '600',
  },
});
