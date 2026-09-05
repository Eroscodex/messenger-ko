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

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Create Account — Messenger-ko';
    }
  }, []);

  const handleRegister = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    setAuthError('');

    if (!cleanName || !cleanEmail || !cleanPass) {
      setAuthError('Please fill in all fields.');
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (cleanPass.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: { data: { full_name: cleanName } },
    });

    if (error) {
      if (error.status === 429 || error.message.toLowerCase().includes('3 seconds') || error.message.toLowerCase().includes('rate_limit')) {
        setAuthError('Please wait 3 seconds before requesting another email confirmation.');
        Alert.alert('Please Wait ⏳', 'For security, please wait 3 seconds before requesting another email confirmation.');
      } else {
        setAuthError(error.message);
        Alert.alert('Registration Error', error.message);
      }
    } else if (data.session) {
      Alert.alert('Account Created! 🎉', 'Welcome to Messenger-ko!');
    } else {
      Alert.alert(
        'Account Created! 🎉',
        `Account created for ${cleanEmail}.\nYou can now log in!`,
        [{ text: 'Go to Login', onPress: () => navigation.goBack() }]
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
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join Messenger-ko today</Text>
        </View>

        <View style={styles.card}>
          {/* Error Banner */}
          {!!authError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#e53935" style={{ marginRight: 6 }} />
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Full Name or Nickname</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#aaa"
              value={name}
              onChangeText={(val) => {
                setName(val);
                if (authError) setAuthError('');
              }}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
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
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                placeholder="Min. 6 characters"
                placeholderTextColor="#aaa"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
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
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={styles.footerLink}
        >
          <Text style={styles.footerText}>
            Already have an account?{' '}
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
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
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
  footerLink: { alignItems: 'center' },
  footerText: { fontSize: 15, color: '#666' },
  footerHighlight: { color: '#0084ff', fontWeight: '700' },
});
