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
  Modal,
  ImageBackground,
  ScrollView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../config/supabase';
import {
  THEMES,
  getSavedThemeId,
  saveThemeId,
  getSavedCustomBg,
  saveCustomBg,
} from '../utils/themeUtils';
import {
  formatMessageTime,
  getDateDividerLabel,
  shouldShowDateHeader,
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

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export default function ChatScreenWeb() {
  const [messages, setMessages] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Offline Sync State
  const [syncProgress, setSyncProgress] = useState({ isSyncing: false, remaining: 0 });

  // Online Realtime Presence State
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Theme & Background States
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

  // Reaction Modal State (Guaranteed FRONT overlay)
  const [activeReactionItem, setActiveReactionItem] = useState(null);

  // Media Preview State
  const [selectedMediaUrl, setSelectedMediaUrl] = useState(null);
  const [reactionsMap, setReactionsMap] = useState({});

  const theme = THEMES[currentThemeId] || THEMES.classic;

  const formatMessage = (msg) => ({
    id: String(msg.id || msg.temp_id || `msg_${Date.now()}`),
    text: msg.text || '',
    userEmail: msg.user_email || msg.sender_email || 'unknown',
    imageUrl: msg.image_url || msg.media_url || null,
    videoUrl: msg.video_url || null,
    createdAt: new Date(msg.created_at || Date.now()),
    status: msg.status || 'sent',
  });

  useEffect(() => {
    // Set Document Title & Official Messenger ⚡ Favicon on Web
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Messenger-ko Karl & Lezil 𓍯𓂃𓏧♡💫👀💞🫶';
      try {
        const existingLinks = document.querySelectorAll("link[rel*='icon']");
        existingLinks.forEach((el) => el.remove());

        const linkPng = document.createElement('link');
        linkPng.rel = 'icon';
        linkPng.type = 'image/png';
        linkPng.href = '/favicon.png';
        document.head.appendChild(linkPng);

        const linkIco = document.createElement('link');
        linkIco.rel = 'shortcut icon';
        linkIco.type = 'image/x-icon';
        linkIco.href = '/favicon.ico';
        document.head.appendChild(linkIco);
      } catch (e) {}
    }

    // Fetch auth user & saved settings
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
        setMessages(cached.map(formatMessage).reverse());
      }
      fetchMessages();
    });

    // 2. Start Offline Auto-Sync Loop
    const stopSyncLoop = startOfflineSyncLoop((progress) => {
      setSyncProgress(progress);
      getCachedMessages().then((cached) => {
        if (cached && cached.length > 0) {
          setMessages(cached.map(formatMessage).reverse());
        }
      });
    }, 4000);

    // Realtime Database Changes Channel
    const msgChannel = supabase
      .channel('public:messages:web_v3')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newFormatted = formatMessage(payload.new);
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newFormatted.id || m.id === payload.new.temp_id);
            if (exists) {
              return prev.map((m) => (m.id === newFormatted.id || m.id === payload.new.temp_id ? newFormatted : m));
            }
            return [newFormatted, ...prev];
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
      supabase.removeChannel(msgChannel);
    };
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
        .limit(120);
      if (error) {
        console.warn('Web fetch error:', error.message);
        return;
      }
      if (data) {
        const formatted = data.map(formatMessage);
        setMessages(formatted);
        setCachedMessages(data);
      }
    } catch (e) {
      console.warn('Web offline fetch fallback:', e);
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
        userEmail: userEmail || 'web-user',
      });
      setMessages(allMessages.map(formatMessage).reverse());
    } catch (e) {
      console.error('Web Send error:', e);
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

  const openFilePicker = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
      };
      input.click();
    }
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

      const { error: msgError } = await supabase.from('messages').insert([
        {
          text: '',
          user_email: userEmail || 'web-user',
          image_url: isVideo ? null : urlData.publicUrl,
          video_url: isVideo ? urlData.publicUrl : null,
        },
      ]);

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

  const pickCustomWallpaper = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target.result;
            setTempCustomBg(result);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
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

  const renderItem = ({ item, index }) => {
    const mine = item.userEmail === userEmail;
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

        <View style={[styles.row, mine ? styles.rowMe : styles.rowOther]}>
          {!mine && (
            isFirstInGroup ? (
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            ) : (
              <View style={styles.avatarSpacer} />
            )
          )}

          <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
            {!mine && isFirstInGroup && <Text style={styles.senderName}>{displayName}</Text>}

            <View style={styles.bubbleContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => setActiveReactionItem(item)}
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: theme.bubbleMe }
                    : { backgroundColor: theme.bubbleOther, borderColor: '#eaeaea', borderWidth: 1 },
                ]}
              >
                {item.imageUrl ? (
                  <TouchableOpacity onPress={() => setSelectedMediaUrl(item.imageUrl)}>
                    <Image source={{ uri: item.imageUrl }} style={styles.mediaImage} resizeMode="cover" />
                  </TouchableOpacity>
                ) : item.videoUrl ? (
                  <View style={styles.videoBox}>
                    <Text style={styles.videoLink} onPress={() => window.open(item.videoUrl, '_blank')}>
                      🎥 Tap to watch video
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.msgText, { color: mine ? theme.textMe : theme.textOther }]}>
                    {item.text}
                  </Text>
                )}

                <View style={styles.bubbleFooter}>
                  <Text style={[styles.time, { color: mine ? 'rgba(255,255,255,0.75)' : '#888' }]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>

                  {mine && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginRight: 2 }}>
                      {item.status === 'pending' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 193, 7, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, color: '#ffd54f', fontWeight: '600' }}>⏳ Queued</Text>
                        </View>
                      ) : item.status === 'syncing' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(33, 150, 243, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, color: '#64b5f6', fontWeight: '600' }}>⚡ Syncing</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>✓✓</Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => setActiveReactionItem(item)}
                    style={styles.reactionBtn}
                  >
                    <Text style={styles.reactionBtnIcon}>😊</Text>
                  </TouchableOpacity>

                  {mine && (
                    <TouchableOpacity onPress={() => deleteMessage(item.id)} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Active Emoji Badges */}
            {activeEmojis.length > 0 && (
              <View style={[styles.activeReactionsBadge, mine ? styles.activeReactionsMe : styles.activeReactionsOther]}>
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

  const renderChatContent = () => (
    <View style={styles.chatWrapper}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.composer, { backgroundColor: theme.composerBg, borderTopColor: theme.inputBorder }]}>
        <TouchableOpacity style={styles.attachBtn} onPress={openFilePicker} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Text style={styles.attachIcon}>📎</Text>
          )}
        </TouchableOpacity>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              color: theme.inputText,
            },
          ]}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => sendMessage()}
          multiline
          maxLength={1000}
        />

        {text.trim().length > 0 ? (
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: theme.accent }, sending && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendText}>➤</Text>
            )}
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
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* Integrated Header Bar */}
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
                {isPartnerOnline ? '🟢 Online Now' : '⚪ Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: theme.inputBg }]}
              onPress={() => setNicknameModalVisible(true)}
            >
              <Text style={styles.headerActionBtnText}>✏️ Names</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: theme.inputBg }]}
              onPress={openThemeModal}
            >
              <Text style={styles.headerActionBtnText}>🎨 Theme</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: '#fff0f0', borderColor: '#ffcccc' }]}
              onPress={handleLogout}
            >
              <Text style={[styles.headerActionBtnText, { color: '#e53935' }]}>🚪 Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Piso Wi-Fi / Low Data Offline Sync Banner */}
        {syncProgress.remaining > 0 ? (
          <View style={[styles.syncBanner, { backgroundColor: syncProgress.isSyncing ? '#0288d1' : '#e65100' }]}>
            <Text style={styles.syncBannerText} numberOfLines={1}>
              {syncProgress.isSyncing
                ? `⚡ Syncing ${syncProgress.remaining} offline message${syncProgress.remaining > 1 ? 's' : ''} Guinobatan ↔ Sto. Domingo...`
                : `📶 Piso Wi-Fi Offline — ${syncProgress.remaining} message${syncProgress.remaining > 1 ? 's' : ''} queued (Auto-sync on connection)`}
            </Text>
          </View>
        ) : (
          <View style={[styles.syncBanner, { backgroundColor: '#2e7d32' }]}>
            <Text style={styles.syncBannerText} numberOfLines={1}>
              🛡️ Piso Wi-Fi Data-Saver Active — Low Bandwidth Auto-Sync Ready
            </Text>
          </View>
        )}

        {/* Chat Body & Custom Wallpaper Background */}
        {customBg ? (
          <ImageBackground source={{ uri: customBg }} style={styles.bgImage} resizeMode="cover">
            <View style={styles.bgOverlay}>{renderChatContent()}</View>
          </ImageBackground>
        ) : (
          renderChatContent()
        )}

        {/* Emoji Reaction Overlay Modal - Guaranteed Front Stacking on Mobile & Web */}
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

        {/* Theme Modal with Save / Cancel */}
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
                  <Text style={styles.modalCloseText}>✕</Text>
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
                <Text style={styles.sectionSubtext}>Upload an image background for your chat!</Text>

                <TouchableOpacity style={styles.uploadWallpaperBtn} onPress={pickCustomWallpaper}>
                  <Text style={styles.uploadWallpaperBtnText}>📷 Select Custom Image</Text>
                </TouchableOpacity>

                {tempCustomBg && (
                  <TouchableOpacity style={styles.clearWallpaperBtn} onPress={clearTempWallpaper}>
                    <Text style={styles.clearWallpaperBtnText}>🗑 Remove Wallpaper Image</Text>
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
                  <Text style={styles.modalCloseText}>✕</Text>
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

        {/* Fullscreen Image Preview */}
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
      </View>
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
  headerActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  headerActionBtnText: { fontSize: 11, fontWeight: '600', color: '#333' },

  // Messages List
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

  row: { flexDirection: 'row', alignItems: 'flex-end' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  mediaImage: { width: 200, height: 150, borderRadius: 12 },
  videoBox: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 10 },
  videoLink: { color: '#fff', fontSize: 13, fontWeight: '600' },

  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 5,
  },
  time: { fontSize: 10, textAlign: 'right' },
  reactionBtn: { paddingHorizontal: 2 },
  reactionBtnIcon: { fontSize: 11, opacity: 0.8 },
  deleteBtn: { paddingHorizontal: 2 },
  deleteBtnText: { fontSize: 12 },

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
  attachBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 20 },

  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
  modalCloseText: { fontSize: 18, fontWeight: '700', color: '#888' },
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
    backgroundColor: '#0084ff',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  uploadWallpaperBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clearWallpaperBtn: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
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
