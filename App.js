import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from './src/config/supabase';

import LoginScreen from './src/screens/LoginScreen';
import ChatScreen from './src/screens/ChatScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Logout Error', error.message);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Stack.Navigator>
        {!session ? (
          // Auth Stack
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          </>
        ) : (
          // Main Stack
          <>
            <Stack.Screen 
              name="Chat" 
              component={ChatScreen} 
              options={{
                title: 'Messenger-ko Love𓍯𓂃𓏧♡💫👀💞🫶',
                headerRight: () => (
                  <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
                    <Text style={{ color: '#007AFF', fontSize: 16 }}>Logout</Text>
                  </TouchableOpacity>
                ),
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
}
