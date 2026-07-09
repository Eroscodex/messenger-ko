import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { supabase } from '../config/supabase';

export default function ChatScreenWeb() {
  const [messages, setMessages] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    fetchMessages();

    const channel = supabase
      .channel('public:messages:web')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [formatMessage(payload.new), ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages',}, (payload) => {
          setMessages((prev) => prev.filter((msg) => msg.id !== String(payload.old.id)));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const formatMessage = (msg) => ({
    id: String(msg.id),
    text: msg.text || '',
    userEmail: msg.user_email || 'unknown',
    imageUrl: msg.image_url || null,
    videoUrl: msg.video_url || null,
    createdAt: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { Alert.alert('Error', error.message); return; }
    setMessages((data || []).map(formatMessage));
  };

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert([{
      text: trimmed,
      user_email: userEmail || 'web-user',
      image_url: null,
      video_url: null,
    }]);
    if (error) Alert.alert('Send Error', error.message);
    else setText('');
    setSending(false);
  };

    const deleteMessage = async (id) => {
    console.log("Trying delete:", id);

    const { data, error } = await supabase
      .from("messages")
      .delete()
      .eq("id", id)
      .select();

    console.log("Delete result:", data);
    console.log("Delete error:", error);

    if (error) {
      Alert.alert("Delete Error", error.message);
      return;
    }

    setMessages((prev) =>
      prev.filter((msg) => msg.id !== id)
    );
  };

  const openFilePicker = () => {
    // Create hidden file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) uploadFile(file);
    };
    input.click();
  };

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const isVideo = file.type.startsWith('video/');
      const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
      const fileName = `${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('chat_media').getPublicUrl(fileName);

      const { error: msgError } = await supabase.from('messages').insert([{
        text: '',
        user_email: userEmail || 'web-user',
        image_url: isVideo ? null : urlData.publicUrl,
        video_url: isVideo ? urlData.publicUrl : null,
      }]);

      if (msgError) throw msgError;
    } catch (e) {
      Alert.alert('Upload Error', e.message || 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  const getInitials = (email) => (email ? email.charAt(0).toUpperCase() : '?');

  const renderItem = ({ item, index }) => {
    const mine = item.userEmail === userEmail;
    const prev = messages[index + 1];
    const isFirst = !prev || prev.userEmail !== item.userEmail;

    return (
      <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
        {!mine && (
          isFirst ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(item.userEmail)}
              </Text>
            </View>
          ) : (
            <View style={styles.avatarSpacer} />
          )
        )}

        <View
          style={[
            styles.bubbleWrap,
            mine ? styles.bubbleWrapMe : styles.bubbleWrapOther,
          ]}
        >
          {!mine && isFirst && (
            <Text style={styles.senderName}>
              {item.userEmail.split('@')[0]}
            </Text>
          )}

          <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleOther]}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.mediaImage}
                resizeMode="cover"
              />
            ) : item.videoUrl ? (
              <View style={styles.videoBox}>
                <Text
                  style={styles.videoLink}
                  onPress={() => window.open(item.videoUrl, "_blank")}
                >
                  🎥 Tap to open video
                </Text>
              </View>
            ) : (
              <Text style={[styles.msgText, mine && styles.msgTextMe]}>
                {item.text}
              </Text>
            )}

            {/* Time + Delete Button */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text style={[styles.time, mine && styles.timeMe]}>
                {item.createdAt}
              </Text>

              {mine && (
              <TouchableOpacity
                onPress={() => {
                  console.log("DELETE CLICKED:", item.id);
                  deleteMessage(item.id);
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 16,
                    marginLeft: 10,
                  }}
                >
                  🗑
                </Text>
              </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    )
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.composer}>
        <TouchableOpacity style={styles.attachBtn} onPress={openFilePicker} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Text style={styles.attachIcon}>📎</Text>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          onSubmitEditing={sendMessage}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendText}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  list: { paddingHorizontal: 14, paddingVertical: 12 },

  row: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end' },
  rowMe: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#5856D6',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  avatarSpacer: { width: 40 },

  bubbleWrap: { maxWidth: '72%' },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },

  senderName: { fontSize: 12, color: '#666', marginBottom: 3, marginLeft: 4, fontWeight: '600' },

  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 6 },
  bubbleMe: { backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },

  msgText: { fontSize: 16, color: '#1a1a2e', lineHeight: 22 },
  msgTextMe: { color: '#fff' },
  mediaImage: { width: 220, height: 170, borderRadius: 12 },
  videoBox: {
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  videoLink: { color: '#fff', fontSize: 15, fontWeight: '600' },
  time: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' },
  timeMe: { color: 'rgba(255,255,255,0.75)' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ececf2', gap: 8,
  },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 22 },

  input: {
    flex: 1, backgroundColor: '#f7f8fc',
    borderWidth: 1.5, borderColor: '#e8eaf0', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 16, color: '#1a1a2e', maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  sendBtnDisabled: { backgroundColor: '#c7d5f0', shadowOpacity: 0, elevation: 0 },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
