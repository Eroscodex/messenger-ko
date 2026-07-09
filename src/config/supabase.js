import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dvwjzmprpjegdhewpzuu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2d2p6bXBycGplZ2RoZXdwenV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTA0MTksImV4cCI6MjA5ODQ4NjQxOX0.FCJR0r035xm3j7l3nh4te4PKnHoCnk_mrDtRQwtnfHg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
