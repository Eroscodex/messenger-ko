import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { decode } from 'base64-arraybuffer';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    fetchMessages();

    const channel = supabase
      .channel('chat:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [formatMessage(payload.new), ...prev]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const formatMessage = (msg) => ({
    id: String(msg.id),
    text: msg.text || '',
    userEmail: msg.user_email || '',
    imageUrl: msg.image_url || null,
    createdAt: new Date(msg.created_at),
  });

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) { console.error('Fetch error', error.message); return; }
    setMessages((data || []).map(formatMessage));
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    const { error } = await supabase
      .from('messages')
      .insert([{ text: trimmed, user_email: userEmail, image_url: null, video_url: null }]);
    if (error) Alert.alert('Error', error.message);
    setSending(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      uploadImage(result.assets[0].base64);
    }
  };

  const uploadImage = async (base64Data) => {
    setUploading(true);
    try {
      const fileName = `${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(fileName, decode(base64Data), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('chat_media').getPublicUrl(fileName);
      const { error: msgError } = await supabase
        .from('messages')
        .insert([{ text: '', user_email: userEmail, image_url: urlData.publicUrl, video_url: null }]);
      if (msgError) throw msgError;
    } catch (e) {
      Alert.alert('Upload Error', e.message || 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (date) => {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const getInitials = (email) => (email ? email.charAt(0).toUpperCase() : '?');

  const renderMessage = ({ item, index }) => {
    const isMe = item.userEmail === userEmail;
    const prevItem = messages[index + 1];
    const isFirstInGroup = !prevItem || prevItem.userEmail !== item.userEmail;

    return (
      <View style={[styles.messageRow, isMe ? styles.rowMe : styles.rowOther]}>
        {!isMe ? (
          isFirstInGroup ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.userEmail)}</Text>
            </View>
          ) : (
            <View style={styles.avatarSpacer} />
          )
        ) : null}

        <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
          {!isMe && isFirstInGroup && (
            <Text style={styles.senderName}>{item.userEmail.split('@')[0]}</Text>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.messageImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{item.text}</Text>
            )}
            <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.composer}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImage} disabled={uploading || sending}>
          {uploading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Ionicons name="image-outline" size={24} color="#007AFF" />
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.composerInput}
          placeholder="Message..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  listContent: { paddingHorizontal: 12, paddingVertical: 12 },
  messageRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end' },
  rowMe: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#5856D6',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  avatarSpacer: { width: 40 },
  bubbleWrap: { maxWidth: '75%' },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },
  senderName: { fontSize: 12, color: '#666', marginBottom: 3, marginLeft: 4, fontWeight: '600' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 6 },
  bubbleMe: { backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  messageText: { fontSize: 16, color: '#1a1a2e', lineHeight: 22 },
  messageTextMe: { color: '#fff' },
  messageImage: { width: 200, height: 160, borderRadius: 12 },
  timeText: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' },
  timeTextMe: { color: 'rgba(255,255,255,0.75)' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ececf2', gap: 8,
  },
  attachButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  composerInput: {
    flex: 1, backgroundColor: '#f7f8fc', borderWidth: 1.5, borderColor: '#e8eaf0',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 16, color: '#1a1a2e', maxHeight: 120,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  sendButtonDisabled: { backgroundColor: '#c7d5f0', shadowOpacity: 0, elevation: 0 },
});
