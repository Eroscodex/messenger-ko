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
  Modal,
  ImageBackground,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { decode } from 'base64-arraybuffer';
import {
  THEMES,
  getSavedThemeId,
  saveThemeId,
  getSavedCustomBg,
  saveCustomBg,
} from '../utils/themeUtils';
  formatMessageTime,
  getDateDividerLabel,
  shouldShowDateHeader,
  formatLastActiveTime,
} from '../utils/dateUtils';
import {
  getSavedNicknames,
  saveNickname,
  getDisplayName,
} from '../utils/nicknameUtils';
import {
  getCachedMessages,
  setCachedMessages,
  sendOrQueueMessage,
  startOfflineSyncLoop,
} from '../services/offlineSyncService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
const LAST_SEEN_KEY = '@messenger_partner_last_seen';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Offline Sync State
  const [syncProgress, setSyncProgress] = useState({ isSyncing: false, remaining: 0 });

  // Realtime Presence State
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [partnerLastActive, setPartnerLastActive] = useState(null);
  const [, setTick] = useState(0);

  // Theme & Wallpaper State
  const [currentThemeId, setCurrentThemeId] = useState('classic');
  const [customBg, setCustomBg] = useState(null);
  const [isThemeModalVisible, setThemeModalVisible] = useState(false);

  // Temporary Theme Draft state for Save / Cancel
  const [tempThemeId, setTempThemeId] = useState('classic');
  const [tempCustomBg, setTempCustomBg] = useState(null);

  // Nicknames State
  const [nicknames, setNicknames] = useState({});
  const [isNicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [karlNicknameInput, setKarlNicknameInput] = useState('');
  const [lezilNicknameInput, setLezilNicknameInput] = useState('');

  // Reaction Modal State (Guaranteed FRONT overlay on Mobile / Android)
  const [activeReactionItem, setActiveReactionItem] = useState(null);

  // Media Modal State
  const [selectedMediaUrl, setSelectedMediaUrl] = useState(null);
  const [reactionsMap, setReactionsMap] = useState({});

  const flatListRef = useRef(null);
  const theme = THEMES[currentThemeId] || THEMES.classic;

  const formatMessage = (msg) => ({
    id: String(msg.id || msg.temp_id || `msg_${Date.now()}`),
    text: msg.text || '',
    userEmail: msg.user_email || msg.sender_email || '',
    imageUrl: msg.image_url || msg.media_url || null,
    videoUrl: msg.video_url || null,
    createdAt: new Date(msg.created_at || Date.now()),
    status: msg.status || 'sent',
  });

  const sortMessages = (list) => {
    const map = new Map();
    (list || []).forEach((m) => {
      if (m && m.id) map.set(m.id, m);
    });
    return Array.from(map.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    getSavedThemeId().then((id) => {
      setCurrentThemeId(id);
      setTempThemeId(id);
    });
    getSavedCustomBg().then((bg) => {
      setCustomBg(bg);
      setTempCustomBg(bg);
    });
    getSavedNicknames().then((saved) => {
      setNicknames(saved);
      if (saved['karl']) setKarlNicknameInput(saved['karl']);
      if (saved['lezil']) setLezilNicknameInput(saved['lezil']);
    });

    // 1. Initial Local Cache Load
    getCachedMessages().then((cached) => {
      if (cached && cached.length > 0) {
        setMessages(sortMessages(cached.map(formatMessage)));
      }
      fetchMessages();
    });

    // 2. Start Offline Auto-Sync Loop
    const stopSyncLoop = startOfflineSyncLoop((progress) => {
      setSyncProgress(progress);
      getCachedMessages().then((cached) => {
        if (cached && cached.length > 0) {
          setMessages(sortMessages(cached.map(formatMessage)));
        }
      });
    }, 4000);

    const channel = supabase
      .channel('chat:messages_v3')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newFormatted = formatMessage(payload.new);
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== newFormatted.id && m.id !== payload.new.temp_id);
            return sortMessages([newFormatted, ...filtered]);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => prev.filter((msg) => msg.id !== String(payload.old.id)));
        }
      )
      .subscribe();

    return () => {
      stopSyncLoop();
      supabase.removeChannel(channel);
    };
  }, []);

  // Load saved last active timestamp & set ticker interval
  useEffect(() => {
    AsyncStorage.getItem(LAST_SEEN_KEY).then((saved) => {
      if (saved) setPartnerLastActive(saved);
    });

    const ticker = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(ticker);
  }, []);

  // Supabase Realtime Presence Channel for Online/Offline Status
  useEffect(() => {
    if (!userEmail) return;

    const presenceChannel = supabase.channel('messenger_online_presence', {
      config: { presence: { key: userEmail } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeKeys = Object.keys(state);
        setOnlineUsers(activeKeys);

        // Track partner last active time
        const partnerKey = activeKeys.find((k) => k !== userEmail);
        if (partnerKey && state[partnerKey] && state[partnerKey].length > 0) {
          const meta = state[partnerKey][0];
          const time = meta.online_at || new Date().toISOString();
          setPartnerLastActive(time);
          AsyncStorage.setItem(LAST_SEEN_KEY, time);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_email: userEmail,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [userEmail]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('Fetch error:', error.message);
        return;
      }
      if (data) {
        const formatted = data.map(formatMessage);
        setMessages(sortMessages(formatted));
        setCachedMessages(data);
      }
    } catch (e) {
      console.warn('Offline fetch fallback:', e);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Logout Error', error.message);
  };

  const sendMessage = async (customText = null) => {
    const textToSend = customText !== null ? customText : text.trim();
    if (!textToSend || sending) return;
    setSending(true);
    if (!customText) setText('');

    try {
      const { allMessages } = await sendOrQueueMessage({
        text: textToSend,
        userEmail: userEmail || 'user@messenger.app',
      });
      setMessages(sortMessages(allMessages.map(formatMessage)));
    } catch (e) {
      console.error('Send error:', e);
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id) => {
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) {
      Alert.alert('Delete Error', error.message);
      return;
    }
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
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

  // Theme Handlers
  const openThemeModal = () => {
    setTempThemeId(currentThemeId);
    setTempCustomBg(customBg);
    setThemeModalVisible(true);
  };

  const pickCustomWallpaper = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setTempCustomBg(uri);
    }
  };

  const clearTempWallpaper = () => {
    setTempCustomBg(null);
  };

  const handleSaveTheme = () => {
    setCurrentThemeId(tempThemeId);
    setCustomBg(tempCustomBg);
    saveThemeId(tempThemeId);
    saveCustomBg(tempCustomBg);
    setThemeModalVisible(false);
  };

  const handleCancelTheme = () => {
    setTempThemeId(currentThemeId);
    setTempCustomBg(customBg);
    setThemeModalVisible(false);
  };

  // Nicknames Handlers
  const handleSaveNicknames = async () => {
    let updated = { ...nicknames };
    if (karlNicknameInput.trim()) {
      updated = await saveNickname('karl', karlNicknameInput.trim());
    }
    if (lezilNicknameInput.trim()) {
      updated = await saveNickname('lezil', lezilNicknameInput.trim());
    }
    setNicknames(updated);
    setNicknameModalVisible(false);
  };

  const toggleReaction = (msgId, emoji) => {
    setReactionsMap((prev) => {
      const msgReactions = prev[msgId] || {};
      const currentCount = msgReactions[emoji] || 0;
      return {
        ...prev,
        [msgId]: {
          ...msgReactions,
          [emoji]: currentCount > 0 ? 0 : 1,
        },
      };
    });
    setActiveReactionItem(null);
  };

  // Realtime Online Status Check
  const otherUsersOnline = onlineUsers.filter((u) => u !== userEmail);
  const isPartnerOnline = otherUsersOnline.length > 0;

  const renderMessage = ({ item, index }) => {
    const isMe = item.userEmail === userEmail;
    const olderItem = messages[index + 1];
    const showDateHeader = shouldShowDateHeader(item.createdAt, olderItem?.createdAt);
    const dateLabel = showDateHeader ? getDateDividerLabel(item.createdAt) : null;

    const prevSameSender = olderItem && olderItem.userEmail === item.userEmail && !showDateHeader;
    const isFirstInGroup = !prevSameSender;

    const displayName = getDisplayName(item.userEmail, nicknames);
    const initial = displayName.charAt(0).toUpperCase();

    const msgReactions = reactionsMap[item.id] || {};
    const activeEmojis = Object.keys(msgReactions).filter((e) => msgReactions[e] > 0);

    return (
      <View style={styles.itemContainer}>
        {showDateHeader && (
          <View style={styles.dateHeaderWrap}>
            <View style={styles.dateHeaderPill}>
              <Text style={styles.dateHeaderText}>{dateLabel}</Text>
            </View>
          </View>
        )}

        <View style={[styles.messageRow, isMe ? styles.rowMe : styles.rowOther]}>
          {!isMe ? (
            isFirstInGroup ? (
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            ) : (
              <View style={styles.avatarSpacer} />
            )
          ) : null}

          <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
            {!isMe && isFirstInGroup && <Text style={styles.senderName}>{displayName}</Text>}

            <View style={styles.bubbleContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => setActiveReactionItem(item)}
                style={[
                  styles.bubble,
                  isMe
                    ? { backgroundColor: theme.bubbleMe }
                    : { backgroundColor: theme.bubbleOther, borderColor: '#eaeaea', borderWidth: 1 },
                ]}
              >
                {item.imageUrl ? (
                  <TouchableOpacity onPress={() => setSelectedMediaUrl(item.imageUrl)}>
                    <Image source={{ uri: item.imageUrl }} style={styles.messageImage} resizeMode="cover" />
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.messageText, { color: isMe ? theme.textMe : theme.textOther }]}>
                    {item.text}
                  </Text>
                )}

                <View style={styles.bubbleFooter}>
                  <Text style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.75)' : '#888' }]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>

                  {isMe && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginRight: 2 }}>
                      {item.status === 'pending' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 193, 7, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Ionicons name="time-outline" size={11} color="#ffd54f" style={{ marginRight: 2 }} />
                          <Text style={{ fontSize: 10, color: '#ffd54f', fontWeight: '600' }}>Queued</Text>
                        </View>
                      ) : item.status === 'syncing' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(33, 150, 243, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Ionicons name="sync-outline" size={11} color="#64b5f6" style={{ marginRight: 2 }} />
                          <Text style={{ fontSize: 10, color: '#64b5f6', fontWeight: '600' }}>Syncing</Text>
                        </View>
                      ) : (
                        <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.85)" />
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => setActiveReactionItem(item)}
                    style={styles.reactionBtn}
                  >
                    <Text style={styles.reactionBtnIcon}>😊</Text>
                  </TouchableOpacity>

                  {isMe && (
                    <TouchableOpacity onPress={() => deleteMessage(item.id)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Active Emoji Badges */}
            {activeEmojis.length > 0 && (
              <View style={[styles.activeReactionsBadge, isMe ? styles.activeReactionsMe : styles.activeReactionsOther]}>
                {activeEmojis.map((emoji) => (
                  <Text key={emoji} style={styles.activeEmojiText}>
                    {emoji}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => (
    <View style={styles.chatWrapper}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.composer, { backgroundColor: theme.composerBg, borderTopColor: theme.inputBorder }]}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImage} disabled={uploading || sending}>
          {uploading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Ionicons name="image-outline" size={24} color={theme.accent} />
          )}
        </TouchableOpacity>

        <TextInput
          style={[
            styles.composerInput,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.inputText,
            },
          ]}
          placeholder="Message..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />

        {text.trim().length > 0 ? (
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.accent }, sending && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.quickLikeBtn, { backgroundColor: theme.inputBg }]}
            onPress={() => sendMessage('👍')}
          >
            <Text style={styles.quickLikeText}>👍</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle={currentThemeId === 'dark' || currentThemeId === 'cyberpunk' ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Mobile Header Bar */}
        <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarHeader}>
              <Text style={styles.avatarHeaderText}>⚡</Text>
              <View style={[styles.onlineDot, { backgroundColor: isPartnerOnline ? '#31a24c' : '#ccc' }]} />
            </View>
            <View style={styles.titleBox}>
              <Text style={[styles.headerTitle, { color: theme.headerText }]} numberOfLines={1}>
                Messenger-ko Karl & Lezil 𓍯...
              </Text>
              <Text style={[styles.headerSubtitle, { color: isPartnerOnline ? '#31a24c' : '#888' }]}>
                {isPartnerOnline
                  ? '🟢 Active now'
                  : partnerLastActive
                  ? `⚪ ${formatLastActiveTime(partnerLastActive)}`
                  : '⚪ Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: theme.inputBg }]}
              onPress={() => setNicknameModalVisible(true)}
            >
              <Ionicons name="create-outline" size={14} color={theme.accent} />
              <Text style={[styles.themeBtnText, { color: theme.accent }]}>Names</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: theme.inputBg }]}
              onPress={openThemeModal}
            >
              <Ionicons name="color-palette-outline" size={14} color={theme.accent} />
              <Text style={[styles.themeBtnText, { color: theme.accent }]}>Theme</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: '#fff0f0' }]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={14} color="#e53935" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Piso Wi-Fi / Low Data Offline Sync Banner */}
        {syncProgress.remaining > 0 ? (
          <View style={[styles.syncBanner, { backgroundColor: syncProgress.isSyncing ? '#0288d1' : '#e65100' }]}>
            <Ionicons name={syncProgress.isSyncing ? 'sync-outline' : 'wifi-outline'} size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.syncBannerText} numberOfLines={1}>
              {syncProgress.isSyncing
                ? `Syncing ${syncProgress.remaining} offline message${syncProgress.remaining > 1 ? 's' : ''} Guinobatan ↔ Sto. Domingo...`
                : `Piso Wi-Fi Offline — ${syncProgress.remaining} message${syncProgress.remaining > 1 ? 's' : ''} queued (Auto-sync on connection)`}
            </Text>
          </View>
        ) : (
          <View style={[styles.syncBanner, { backgroundColor: '#2e7d32' }]}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.syncBannerText} numberOfLines={1}>
              Piso Wi-Fi Data-Saver Active — Low Bandwidth Auto-Sync Ready
            </Text>
          </View>
        )}

        {customBg ? (
          <ImageBackground source={{ uri: customBg }} style={styles.bgImage} resizeMode="cover">
            <View style={styles.bgOverlay}>{renderContent()}</View>
          </ImageBackground>
        ) : (
          renderContent()
        )}

        {/* Emoji Reaction Modal - Guaranteed FRONT Stacking on Mobile & Android */}
        <Modal
          visible={!!activeReactionItem}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setActiveReactionItem(null)}
        >
          <TouchableOpacity
            style={styles.reactionModalOverlay}
            activeOpacity={1}
            onPress={() => setActiveReactionItem(null)}
          >
            <View style={styles.reactionModalBox}>
              <Text style={styles.reactionModalTitle}>React to Message</Text>

              {/* Target Message Preview */}
              {activeReactionItem && (
                <View style={styles.targetMessagePreview}>
                  <Text style={styles.targetMessageText} numberOfLines={3}>
                    {activeReactionItem.text || '[Image / Media]'}
                  </Text>
                </View>
              )}

              {/* Reaction Emojis */}
              <View style={styles.reactionEmojiRow}>
                {QUICK_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => toggleReaction(activeReactionItem.id, emoji)}
                    style={styles.reactionModalEmojiBtn}
                  >
                    <Text style={styles.reactionModalEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Theme & Wallpaper Selector Modal */}
        <Modal
          visible={isThemeModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCancelTheme}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🎨 Custom Themes & Wallpaper</Text>
                <TouchableOpacity onPress={handleCancelTheme}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.themeModalBody}>
                <Text style={styles.sectionHeader}>Choose Chat Color Theme</Text>
                <View style={styles.themeGrid}>
                  {Object.values(THEMES).map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.themeCard,
                        { backgroundColor: t.bg },
                        tempThemeId === t.id && styles.themeCardActive,
                      ]}
                      onPress={() => setTempThemeId(t.id)}
                    >
                      <View style={[styles.themeBubblePreview, { backgroundColor: t.bubbleMe }]}>
                        <Text style={{ color: t.textMe, fontSize: 11, fontWeight: 'bold' }}>{t.emoji}</Text>
                      </View>
                      <Text style={styles.themeName}>{t.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionHeader}>Custom Image Wallpaper</Text>
                <Text style={styles.sectionSubtext}>Upload photos from your gallery as wallpaper!</Text>

                <TouchableOpacity style={styles.uploadWallpaperBtn} onPress={pickCustomWallpaper}>
                  <Ionicons name="image" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.uploadWallpaperBtnText}>Upload Custom Image</Text>
                </TouchableOpacity>

                {tempCustomBg && (
                  <TouchableOpacity style={styles.clearWallpaperBtn} onPress={clearTempWallpaper}>
                    <Ionicons name="trash" size={16} color="#e53935" style={{ marginRight: 6 }} />
                    <Text style={styles.clearWallpaperBtnText}>Remove Wallpaper Image</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>

              <View style={styles.modalFooterActions}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={handleCancelTheme}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveTheme}>
                  <Text style={styles.saveActionText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Nicknames Modal */}
        <Modal
          visible={isNicknameModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setNicknameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>✏️ Set User Nicknames</Text>
                <TouchableOpacity onPress={() => setNicknameModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={{ paddingVertical: 12 }}>
                <Text style={styles.sectionSubtext}>Customize display names for Karl & Lezil!</Text>

                <Text style={styles.inputLabel}>Karl's Nickname:</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Karl 💙 / My Man"
                  value={karlNicknameInput}
                  onChangeText={setKarlNicknameInput}
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Lezil's Nickname:</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Lezil 💕 / My Love"
                  value={lezilNicknameInput}
                  onChangeText={setLezilNicknameInput}
                />
              </View>

              <View style={styles.modalFooterActions}>
                <TouchableOpacity
                  style={styles.cancelActionBtn}
                  onPress={() => setNicknameModalVisible(false)}
                >
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveNicknames}>
                  <Text style={styles.saveActionText}>Save Nicknames</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Media Fullscreen Preview Modal */}
        <Modal
          visible={!!selectedMediaUrl}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setSelectedMediaUrl(null)}
        >
          <TouchableOpacity style={styles.imageModalOverlay} activeOpacity={1} onPress={() => setSelectedMediaUrl(null)}>
            <TouchableOpacity onPress={() => setSelectedMediaUrl(null)} style={styles.imageModalCloseBtn}>
              <Text style={styles.imageModalCloseText}>✕ Close</Text>
            </TouchableOpacity>
            {selectedMediaUrl && (
              <Image source={{ uri: selectedMediaUrl }} style={styles.fullImage} resizeMode="contain" />
            )}
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  bgImage: { flex: 1 },
  bgOverlay: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  chatWrapper: { flex: 1 },

  // Header Styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    elevation: 3,
    zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 4, minWidth: 0 },
  avatarHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarHeaderText: { fontSize: 14 },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  titleBox: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 13, fontWeight: '700' },
  headerSubtitle: { fontSize: 10, fontWeight: '600' },
  headerRight: { flexDirection: 'row', gap: 3, alignItems: 'center', flexShrink: 0 },
  themeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
  },
  themeBtnText: { fontSize: 11, fontWeight: '600' },

  // Messages & Date Header
  listContent: { paddingHorizontal: 10, paddingVertical: 10 },
  itemContainer: { marginBottom: 4 },
  dateHeaderWrap: { alignItems: 'center', marginVertical: 10 },
  dateHeaderPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateHeaderText: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 0.5 },

  messageRow: { flexDirection: 'row', alignItems: 'flex-end' },
  rowMe: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  avatarSpacer: { width: 36 },

  bubbleWrap: { maxWidth: '78%' },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },

  senderName: { fontSize: 11, color: '#666', marginBottom: 3, marginLeft: 4, fontWeight: '600' },

  bubbleContainer: { position: 'relative' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    paddingBottom: 5,
  },
  messageText: { fontSize: 15, lineHeight: 21 },
  messageImage: { width: 200, height: 150, borderRadius: 12 },

  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 5,
  },
  timeText: { fontSize: 10, textAlign: 'right' },
  reactionBtn: { paddingHorizontal: 2 },
  reactionBtnIcon: { fontSize: 11, opacity: 0.8 },
  deleteBtn: { paddingHorizontal: 2 },

  activeReactionsBadge: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: -6,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
  },
  activeReactionsMe: { marginRight: 6 },
  activeReactionsOther: { marginLeft: 6 },
  activeEmojiText: { fontSize: 12, marginRight: 2 },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  attachButton: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  composerInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  quickLikeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLikeText: { fontSize: 20 },

  // Reaction Modal (Front Stacking)
  reactionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reactionModalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
  },
  reactionModalTitle: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 10 },
  targetMessagePreview: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
    width: '100%',
  },
  targetMessageText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  reactionEmojiRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  reactionModalEmojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionModalEmojiText: { fontSize: 24 },

  // Theme & Nickname Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  themeModalBody: { paddingVertical: 8 },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 6 },
  sectionSubtext: { fontSize: 12, color: '#666', marginBottom: 10 },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  themeCard: {
    width: '48%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeCardActive: { borderColor: '#0084ff' },
  themeBubblePreview: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeName: { fontSize: 12, fontWeight: '600', color: '#333' },

  divider: { height: 1, backgroundColor: '#eee', marginVertical: 14 },

  uploadWallpaperBtn: {
    flexDirection: 'row',
    backgroundColor: '#0084ff',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadWallpaperBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clearWallpaperBtn: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearWallpaperBtnText: { color: '#e53935', fontSize: 13, fontWeight: '600' },

  modalFooterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  cancelActionText: { color: '#555', fontWeight: '600', fontSize: 13 },
  saveActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0084ff',
  },
  saveActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  inputLabel: { fontSize: 12, fontWeight: '600', color: '#444' },
  modalInput: {
    backgroundColor: '#f7f8fc',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginTop: 4,
  },

  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  imageModalCloseText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fullImage: { width: '90%', height: '80%' },

  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  syncBannerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
