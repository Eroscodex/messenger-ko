import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';

export default function AccountSettingsScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Account Settings — Messenger-ko';
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      setName(user?.user_metadata?.full_name || '');
      setEmail(user?.email || '');
      setLoadingProfile(false);
    });
  }, []);

  const handleSaveProfile = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      email: cleanEmail,
      data: { full_name: cleanName },
    });
    setSavingProfile(false);

    if (error) {
      Alert.alert('Update Failed', error.message);
      return;
    }

    Alert.alert(
      'Account Updated',
      cleanEmail !== email ? 'Your profile was updated. Check your new email to confirm the address change.' : 'Your profile was updated successfully.'
    );
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'Your new password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Enter the same password in both fields.');
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      Alert.alert('Password Update Failed', error.message);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password Updated', 'Your password has been changed successfully.');
  };

  const renderPasswordInput = (value, onChangeText, placeholder, visible, setVisible) => (
    <View style={styles.passwordRow}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9aa3b2"
        secureTextEntry={!visible}
        autoCapitalize="none"
      />
      <TouchableOpacity
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((current) => !current)}
        style={styles.passwordToggle}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748b" />
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#182033" />
          </TouchableOpacity>
          <Text style={styles.title}>Account Settings</Text>
          <View style={styles.backButton} />
        </View>

        {loadingProfile ? (
          <ActivityIndicator size="large" color="#0084ff" style={styles.loader} />
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <View style={styles.iconCircle}>
                  <Ionicons name="person-outline" size={19} color="#0084ff" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Profile</Text>
                  <Text style={styles.sectionSubtitle}>Keep your account details current</Text>
                </View>
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#9aa3b2"
                autoCapitalize="words"
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9aa3b2"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.helper}>Changing your email may require confirmation from the new address.</Text>

              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save Profile</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-closed-outline" size={19} color="#0084ff" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Password</Text>
                  <Text style={styles.sectionSubtitle}>Choose a password with at least 6 characters</Text>
                </View>
              </View>

              <Text style={styles.label}>New password</Text>
              {renderPasswordInput(newPassword, setNewPassword, 'New password', showNewPassword, setShowNewPassword)}

              <Text style={styles.label}>Confirm new password</Text>
              {renderPasswordInput(confirmPassword, setConfirmPassword, 'Confirm new password', showConfirmPassword, setShowConfirmPassword)}

              <TouchableOpacity style={styles.primaryButton} onPress={handleChangePassword} disabled={savingPassword}>
                {savingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Change Password</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f7fb' },
  container: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#182033', fontSize: 22, fontWeight: '800' },
  loader: { marginTop: 48 },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#172033', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e8f3ff', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  sectionTitle: { color: '#182033', fontSize: 17, fontWeight: '800' },
  sectionSubtitle: { color: '#718096', fontSize: 12, marginTop: 2 },
  label: { color: '#344054', fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 14 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#d8dee9', borderRadius: 10, color: '#182033', backgroundColor: '#fbfcfe', paddingHorizontal: 13, fontSize: 15, flex: 1 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordToggle: { padding: 12, marginLeft: -48 },
  helper: { color: '#718096', fontSize: 12, lineHeight: 17, marginTop: 8 },
  primaryButton: { minHeight: 46, borderRadius: 10, backgroundColor: '#0084ff', alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
