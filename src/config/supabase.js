import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://dvwjzmprpjegdhewpzuu.supabase.co';
const supabaseAnonKey = 'sb_publishable_6iyGd31nHsGjU1x6oXY56Q_gO291e-D';

// Custom storage handler that safely catches expired refresh tokens on Web & Native
const CustomStorage = {
  getItem: async (key) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn('Storage getItem fallback:', e);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn('Storage setItem fallback:', e);
    }
  },
  removeItem: async (key) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn('Storage removeItem fallback:', e);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: CustomStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
