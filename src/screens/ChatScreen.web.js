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
import {
  getBlockedUsers,
  blockUser,
  unblockUser,
  isUserBlocked,
  getGroupChats,
  createGroupChat,
  getDirectChats,
  addDirectChat,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendsList,
} from '../utils/userRelationUtils';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

export default function ChatScreenWeb() {
  const [messages, setMessages] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Active Main Tab State ('chats' | 'people')
  const [activeTab, setActiveTab] = useState('chats');

  // Friend Requests & Contacts State
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [addFriendInput, setAddFriendInput] = useState('');

  // Offline Sync State
  const [syncProgress, setSyncProgress] = useState({ isSyncing: false, remaining: 0 });

  // Online Realtime Presence State
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Room / Conversation State
  const [activeRoom, setActiveRoom] = useState({ type: 'general', id: 'general', name: 'General Lounge' });
  const [groupChats, setGroupChats] = useState([]);
  const [directChats, setDirectChats] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);

  // Modals Visibility
  const [isRoomModalVisible, setIsRoomModalVisible] = useState(false);
  const [isAddDMModalVisible, setIsAddDMModalVisible] = useState(false);
  const [isCreateGroupModalVisible, setIsCreateGroupModalVisible] = useState(false);
  const [isBlockModalVisible, setIsBlockModalVisible] = useState(false);

  // Modal Inputs
  const [dmEmailInput, setDmEmailInput] = useState('');
  const [dmNameInput, setDmNameInput] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupMembersInput, setGroupMembersInput] = useState('');
  const [blockEmailInput, setBlockEmailInput] = useState('');

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

    getBlockedUsers().then((list) => setBlockedUsers(list));
    getGroupChats().then((list) => setGroupChats(list));
    getDirectChats().then((list) => setDirectChats(list));

    getFriendRequests().then((reqs) => setFriendRequests(reqs));
    getFriendsList().then((friends) => setFriendsList(friends));

    // 1. Initial Cache Load
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

    const channel = supabase
      .channel('public:messages:web_v4')
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
      supabase.removeChannel(channel);
    };
  }, []);

  // Supabase Realtime Presence Channel for Web Online/Offline Status
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
        .limit(100);

      if (error) {
        console.warn('Fetch error:', error.message);
        return;
      }
      if (data) {
        const formatted = data.map(formatMessage);
        setMessages(formatted);
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
      setMessages(allMessages.map(formatMessage).reverse());
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

  const pickImageWeb = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64Str = reader.result.split(',')[1];
        uploadImage(base64Str, file.type);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const uploadImage = async (base64Data, contentType = 'image/jpeg') => {
    setUploading(true);
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const fileName = `${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(fileName, byteArray, { contentType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('chat_media').getPublicUrl(fileName);
      const { error: msgError } = await supabase
        .from('messages')
        .insert([{ text: '', user_email: userEmail, image_url: urlData.publicUrl, video_url: null }]);

      if (msgError) throw msgError;
    } catch (e) {
      Alert.alert('Upload Error', e.message || 'Something went wrong uploading image.');
    } finally {
      setUploading(false);
    }
  };

  // Friend Request Handlers
  const handleSendFriendRequest = async () => {
    if (!addFriendInput.trim()) {
      Alert.alert('Required field', 'Please enter an email address.');
      return;
    }
    await sendFriendRequest(addFriendInput.trim(), userEmail);
    const updated = await getFriendRequests();
    setFriendRequests(updated);
    const target = addFriendInput.trim();
    setAddFriendInput('');
    Alert.alert('Request Sent! 🚀', `Friend request sent to ${target}.`);
  };

  const handleAcceptFriendRequest = async (requestObj) => {
    const updatedFriends = await acceptFriendRequest(requestObj);
    setFriendsList(updatedFriends || []);
    const updatedReqs = await getFriendRequests();
    setFriendRequests(updatedReqs);
    Alert.alert('Friend Added! 🎉', `You are now connected with ${requestObj.from}!`);
  };

  const handleRejectFriendRequest = async (requestId) => {
    const updatedReqs = await rejectFriendRequest(requestId);
    setFriendRequests(updatedReqs);
  };

  const handleStartFriendChat = async (friendEmail, friendName) => {
    const newDirect = await addDirectChat(friendEmail, friendName);
    const updated = await getDirectChats();
    setDirectChats(updated);
    setActiveRoom({ type: 'dm', id: newDirect.id, name: `👤 ${newDirect.name}` });
    setActiveTab('chats');
  };

  // Block User Handlers
  const handleBlockEmail = async (emailToBlock) => {
    if (!emailToBlock || !emailToBlock.trim()) return;
    const updated = await blockUser(emailToBlock.trim());
    setBlockedUsers(updated);
    setBlockEmailInput('');
    Alert.alert('User Blocked 🚫', `${emailToBlock} has been blocked.`);
  };

  const handleUnblockEmail = async (emailToUnblock) => {
    const updated = await unblockUser(emailToUnblock);
    setBlockedUsers(updated);
  };

  // Add Direct 1-on-1 Chat Handler
  const handleCreateDirectChat = async () => {
    if (!dmEmailInput.trim()) {
      Alert.alert('Required field', 'Please enter an email address.');
      return;
    }
    const newDirect = await addDirectChat(dmEmailInput, dmNameInput);
    const updated = await getDirectChats();
    setDirectChats(updated);
    setActiveRoom({ type: 'dm', id: newDirect.id, name: `👤 ${newDirect.name}` });
    setDmEmailInput('');
    setDmNameInput('');
    setIsAddDMModalVisible(false);
    setIsRoomModalVisible(false);
    setActiveTab('chats');
  };

  // Create Group Chat Handler
  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      Alert.alert('Required field', 'Please enter a Group Name.');
      return;
    }
    const membersList = groupMembersInput
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const newGroup = await createGroupChat(groupNameInput, membersList);
    const updated = await getGroupChats();
    setGroupChats(updated);
    setActiveRoom({ type: 'group', id: newGroup.id, name: `👥 ${newGroup.name}` });
    setGroupNameInput('');
    setGroupMembersInput('');
    setIsCreateGroupModalVisible(false);
    setIsRoomModalVisible(false);
    setActiveTab('chats');
  };

  // Theme Handlers
  const openThemeModal = () => {
    setTempThemeId(currentThemeId);
    setTempCustomBg(customBg);
    setThemeModalVisible(true);
  };

  const pickCustomWallpaperWeb = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setTempCustomBg(reader.result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
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

  // Filter out blocked users' messages
  const visibleMessages = messages.filter((msg) => !isUserBlocked(blockedUsers, msg.userEmail));

  // Realtime Online Status Check
  const otherUsersOnline = onlineUsers.filter((u) => u !== userEmail);
  const isPartnerOnline = otherUsersOnline.length > 0;

  const renderMessage = ({ item, index }) => {
    const isMe = item.userEmail === userEmail;
    const olderItem = visibleMessages[index + 1];
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
            <View style={[styles.dateHeaderPill, { backgroundColor: theme.dateHeaderBg }]}>
              <Text style={[styles.dateHeaderText, { color: theme.dateHeaderText }]}>{dateLabel}</Text>
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
            {!isMe && isFirstInGroup && (
              <Text style={[styles.senderName, { color: theme.senderName }]}>{displayName}</Text>
            )}

            <View style={styles.bubbleContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => setActiveReactionItem(item)}
                style={[
                  styles.bubble,
                  isMe
                    ? { backgroundColor: theme.bubbleMe }
                    : { backgroundColor: theme.bubbleOther, borderColor: theme.isDark ? '#3a3a3a' : '#eaeaea', borderWidth: 1 },
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
                  <Text style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.85)' : (theme.isDark ? '#cccccc' : '#777777') }]}>
                    {formatMessageTime(item.createdAt)}
                  </Text>

                  {isMe && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginRight: 2 }}>
                      {item.status === 'pending' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 193, 7, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, color: '#ffd54f', fontWeight: '600' }}>⏳ Queued</Text>
                        </View>
                      ) : item.status === 'syncing' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(33, 150, 243, 0.25)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, color: '#64b5f6', fontWeight: '600' }}>🔄 Syncing</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>✓✓</Text>
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
                      <Text style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.85)' : '#e53935' }}>🗑️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Active Emoji Badges */}
            {activeEmojis.length > 0 && (
              <View style={[styles.activeReactionsBadge, isMe ? styles.activeReactionsMe : styles.activeReactionsOther, { backgroundColor: theme.activeReactionBg, borderColor: theme.isDark ? '#444' : '#eee' }]}>
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

  const renderPeopleTab = () => (
    <ScrollView contentContainerStyle={styles.peopleTabContainer}>
      {/* Send Friend Request Card */}
      <View style={[styles.peopleCard, { backgroundColor: theme.isDark ? '#262238' : '#ffffff' }]}>
        <Text style={[styles.cardTitleText, { color: theme.modalText }]}>➕ Add Friend by Email</Text>
        <Text style={[styles.cardSubtext, { color: theme.subtext }]}>
          Send a friend request to connect and start chatting!
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <TextInput
            style={[styles.modalInput, { flex: 1, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText, marginTop: 0 }]}
            placeholder="e.g. friend@gmail.com"
            placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
            value={addFriendInput}
            onChangeText={setAddFriendInput}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSendFriendRequest}>
            <Text style={styles.primaryBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Incoming Friend Requests Card */}
      <View style={[styles.peopleCard, { backgroundColor: theme.isDark ? '#262238' : '#ffffff' }]}>
        <Text style={[styles.cardTitleText, { color: theme.modalText }]}>
          📩 Pending Friend Requests ({friendRequests.length})
        </Text>

        {friendRequests.length === 0 ? (
          <Text style={[styles.cardSubtext, { color: theme.subtext, fontStyle: 'italic', marginTop: 4 }]}>
            No pending requests. Send requests above to invite friends!
          </Text>
        ) : (
          friendRequests.map((req) => (
            <View key={req.id} style={styles.requestRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.requestFromText, { color: theme.modalText }]}>{req.from}</Text>
                <Text style={[styles.requestSubtext, { color: theme.subtext }]}>Wants to connect with you</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#31a24c' }]}
                  onPress={() => handleAcceptFriendRequest(req)}
                >
                  <Text style={styles.actionBtnText}>Accept ✅</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#e53935' }]}
                  onPress={() => handleRejectFriendRequest(req.id)}
                >
                  <Text style={styles.actionBtnText}>Reject ❌</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Friends List Card */}
      <View style={[styles.peopleCard, { backgroundColor: theme.isDark ? '#262238' : '#ffffff' }]}>
        <Text style={[styles.cardTitleText, { color: theme.modalText }]}>
          👥 My Friends ({friendsList.length})
        </Text>

        {friendsList.length === 0 ? (
          <Text style={[styles.cardSubtext, { color: theme.subtext, fontStyle: 'italic', marginTop: 4 }]}>
            No confirmed friends yet. Accept pending requests or add friends above!
          </Text>
        ) : (
          friendsList.map((friend) => (
            <View key={friend.id} style={styles.friendRow}>
              <View style={styles.friendAvatar}>
                <Text style={styles.friendAvatarText}>{friend.name.charAt(0).toUpperCase()}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.friendNameText, { color: theme.modalText }]}>{friend.name}</Text>
                <Text style={[styles.friendEmailText, { color: theme.subtext }]}>{friend.email}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#0084ff' }]}
                  onPress={() => handleStartFriendChat(friend.email, friend.name)}
                >
                  <Text style={styles.actionBtnText}>Chat 💬</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(229,57,53,0.15)' }]}
                  onPress={() => handleBlockEmail(friend.email)}
                >
                  <Text style={{ color: '#e53935', fontSize: 12, fontWeight: '700' }}>Block 🚫</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Blocked Users Card */}
      <View style={[styles.peopleCard, { backgroundColor: theme.isDark ? '#262238' : '#ffffff' }]}>
        <Text style={[styles.cardTitleText, { color: theme.modalText }]}>
          🚫 Blocked Users ({blockedUsers.length})
        </Text>

        {blockedUsers.length === 0 ? (
          <Text style={[styles.cardSubtext, { color: theme.subtext, fontStyle: 'italic', marginTop: 4 }]}>
            No blocked users.
          </Text>
        ) : (
          blockedUsers.map((email) => (
            <View key={email} style={styles.blockedUserRow}>
              <Text style={[styles.blockedUserEmail, { color: theme.modalText }]}>{email}</Text>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblockEmail(email)}
              >
                <Text style={styles.unblockBtnText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderContent = () => (
    <View style={styles.chatWrapper}>
      <FlatList
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.composer, { backgroundColor: theme.composerBg, borderTopColor: theme.inputBorder }]}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImageWeb} disabled={uploading || sending}>
          {uploading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <Text style={{ fontSize: 20 }}>📷</Text>
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
          placeholder={`Message in ${activeRoom.name}...`}
          placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
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
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>➤</Text>
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
        {/* Header Bar */}
        <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => setIsRoomModalVisible(true)}>
            <View style={styles.avatarHeader}>
              <Text style={styles.avatarHeaderText}>⚡</Text>
              <View style={[styles.onlineDot, { backgroundColor: isPartnerOnline ? '#31a24c' : '#ccc' }]} />
            </View>
            <View style={styles.titleBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.headerTitle, { color: theme.headerText }]} numberOfLines={1}>
                  {activeRoom.name}
                </Text>
                <Text style={{ color: theme.headerText, fontSize: 12 }}>▼</Text>
              </View>
              <Text style={[styles.headerSubtitle, { color: isPartnerOnline ? '#31a24c' : (theme.isDark ? '#aaaaaa' : '#888888') }]}>
                {isPartnerOnline ? '🟢 Online Now' : '⚪ Offline'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: theme.inputBg }]}
              onPress={() => setNicknameModalVisible(true)}
            >
              <Text style={[styles.themeBtnText, { color: theme.accent }]}>✏️ Names</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: theme.inputBg }]}
              onPress={openThemeModal}
            >
              <Text style={[styles.themeBtnText, { color: theme.accent }]}>🎨 Theme</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: '#fff0f0' }]}
              onPress={handleLogout}
            >
              <Text style={{ fontSize: 12, color: '#e53935', fontWeight: 'bold' }}>🚪 Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Segmented Navigation Bar: Chats | People */}
        <View style={[styles.segmentedTabBar, { backgroundColor: theme.isDark ? '#1f1b2e' : '#eef2fd' }]}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'chats' && styles.tabBtnActive]}
            onPress={() => setActiveTab('chats')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'chats' && styles.tabBtnTextActive]}>
              💬 Chats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'people' && styles.tabBtnActive]}
            onPress={() => setActiveTab('people')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'people' && styles.tabBtnTextActive]}>
              👥 People & Requests
            </Text>
            {friendRequests.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{friendRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Piso Wi-Fi / Low Data Offline Sync Banner */}
        {syncProgress.remaining > 0 ? (
          <View style={[styles.syncBanner, { backgroundColor: syncProgress.isSyncing ? '#0288d1' : '#e65100' }]}>
            <Text style={styles.syncBannerText} numberOfLines={1}>
              {syncProgress.isSyncing
                ? `🔄 Syncing ${syncProgress.remaining} offline message${syncProgress.remaining > 1 ? 's' : ''}...`
                : `📶 Piso Wi-Fi Offline — ${syncProgress.remaining} queued`}
            </Text>
          </View>
        ) : (
          <View style={[styles.syncBanner, { backgroundColor: '#2e7d32' }]}>
            <Text style={styles.syncBannerText} numberOfLines={1}>
              🛡️ Piso Wi-Fi Data-Saver Active — Low Bandwidth Ready
            </Text>
          </View>
        )}

        {/* Render Tab View */}
        {activeTab === 'people' ? (
          renderPeopleTab()
        ) : customBg ? (
          <ImageBackground source={{ uri: customBg }} style={styles.bgImage} resizeMode="cover">
            <View style={styles.bgOverlay}>{renderContent()}</View>
          </ImageBackground>
        ) : (
          renderContent()
        )}

        {/* Room Switcher Modal */}
        <Modal
          visible={isRoomModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsRoomModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>💬 Conversations & Rooms</Text>
                <TouchableOpacity onPress={() => setIsRoomModalVisible(false)}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                <Text style={[styles.sectionHeader, { color: theme.modalText }]}>Default Lounge</Text>
                <TouchableOpacity
                  style={[styles.roomCard, activeRoom.id === 'general' && styles.roomCardActive]}
                  onPress={() => {
                    setActiveRoom({ type: 'general', id: 'general', name: 'General Lounge' });
                    setIsRoomModalVisible(false);
                    setActiveTab('chats');
                  }}
                >
                  <Text style={styles.roomIcon}>💬</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roomTitle, { color: theme.modalText }]}>General Lounge</Text>
                    <Text style={[styles.roomSubtext, { color: theme.subtext }]}>Shared main community chat room</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.sectionHeader, { color: theme.modalText }]}>👥 Group Chats</Text>
                  <TouchableOpacity onPress={() => setIsCreateGroupModalVisible(true)}>
                    <Text style={{ color: '#0084ff', fontWeight: '700', fontSize: 13 }}>+ New Group</Text>
                  </TouchableOpacity>
                </View>

                {groupChats.length === 0 ? (
                  <Text style={[styles.sectionSubtext, { color: theme.subtext, fontStyle: 'italic' }]}>
                    No group chats created yet. Tap "+ New Group" above!
                  </Text>
                ) : (
                  groupChats.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.roomCard, activeRoom.id === g.id && styles.roomCardActive]}
                      onPress={() => {
                        setActiveRoom({ type: 'group', id: g.id, name: `👥 ${g.name}` });
                        setIsRoomModalVisible(false);
                        setActiveTab('chats');
                      }}
                    >
                      <Text style={styles.roomIcon}>👥</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomTitle, { color: theme.modalText }]}>{g.name}</Text>
                        <Text style={[styles.roomSubtext, { color: theme.subtext }]}>{g.members.length} member(s)</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                <View style={styles.divider} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.sectionHeader, { color: theme.modalText }]}>👤 Direct Messages (1-on-1)</Text>
                  <TouchableOpacity onPress={() => setIsAddDMModalVisible(true)}>
                    <Text style={{ color: '#0084ff', fontWeight: '700', fontSize: 13 }}>+ Add to Chat</Text>
                  </TouchableOpacity>
                </View>

                {directChats.length === 0 ? (
                  <Text style={[styles.sectionSubtext, { color: theme.subtext, fontStyle: 'italic' }]}>
                    No direct chats added yet. Tap "+ Add to Chat" above!
                  </Text>
                ) : (
                  directChats.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.roomCard, activeRoom.id === d.id && styles.roomCardActive]}
                      onPress={() => {
                        setActiveRoom({ type: 'dm', id: d.id, name: `👤 ${d.name}` });
                        setIsRoomModalVisible(false);
                        setActiveTab('chats');
                      }}
                    >
                      <Text style={styles.roomIcon}>👤</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.roomTitle, { color: theme.modalText }]}>{d.name}</Text>
                        <Text style={[styles.roomSubtext, { color: theme.subtext }]}>{d.email}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                <View style={styles.divider} />

                <TouchableOpacity
                  style={styles.blockManagerBtn}
                  onPress={() => {
                    setIsBlockModalVisible(true);
                  }}
                >
                  <Text style={{ color: '#e53935', fontWeight: '700', fontSize: 14 }}>🚫 Manage Blocked Users ({blockedUsers.length})</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Add Direct DM Modal ("Add to Chat") */}
        <Modal
          visible={isAddDMModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsAddDMModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>👤 Add to Chat (1-on-1)</Text>
                <TouchableOpacity onPress={() => setIsAddDMModalVisible(false)}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ paddingVertical: 10 }}>
                <Text style={[styles.sectionSubtext, { color: theme.subtext }]}>
                  Enter the email address of the person you want to chat with.
                </Text>
                <Text style={[styles.inputLabel, { color: theme.modalText }]}>Email Address:</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="user@example.com"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                  value={dmEmailInput}
                  onChangeText={setDmEmailInput}
                  autoCapitalize="none"
                />

                <Text style={[styles.inputLabel, { color: theme.modalText, marginTop: 10 }]}>Display Nickname (Optional):</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="Enter nickname"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                  value={dmNameInput}
                  onChangeText={setDmNameInput}
                />
              </View>

              <View style={styles.modalFooterActions}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setIsAddDMModalVisible(false)}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={handleCreateDirectChat}>
                  <Text style={styles.saveActionText}>Start Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Create Group Chat Modal */}
        <Modal
          visible={isCreateGroupModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsCreateGroupModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>👥 Create Group Chat</Text>
                <TouchableOpacity onPress={() => setIsCreateGroupModalVisible(false)}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ paddingVertical: 10 }}>
                <Text style={[styles.sectionSubtext, { color: theme.subtext }]}>
                  Create a custom group conversation room for your team or family!
                </Text>

                <Text style={[styles.inputLabel, { color: theme.modalText }]}>Group Name:</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="Enter group name"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                  value={groupNameInput}
                  onChangeText={setGroupNameInput}
                />

                <Text style={[styles.inputLabel, { color: theme.modalText, marginTop: 10 }]}>Member Emails (comma separated):</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="member1@example.com, member2@example.com"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                  value={groupMembersInput}
                  onChangeText={setGroupMembersInput}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalFooterActions}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setIsCreateGroupModalVisible(false)}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={handleCreateGroup}>
                  <Text style={styles.saveActionText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Block Management Modal */}
        <Modal
          visible={isBlockModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setIsBlockModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>🚫 User Blocking & Privacy</Text>
                <TouchableOpacity onPress={() => setIsBlockModalVisible(false)}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                <Text style={[styles.sectionHeader, { color: theme.modalText }]}>Block New User</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText, marginTop: 0 }]}
                    placeholder="Enter email to block..."
                    placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                    value={blockEmailInput}
                    onChangeText={setBlockEmailInput}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: '#e53935', paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => handleBlockEmail(blockEmailInput)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Block</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                <Text style={[styles.sectionHeader, { color: theme.modalText }]}>Currently Blocked Users ({blockedUsers.length})</Text>
                {blockedUsers.length === 0 ? (
                  <Text style={[styles.sectionSubtext, { color: theme.subtext, fontStyle: 'italic' }]}>
                    No blocked users. You're receiving messages from everyone!
                  </Text>
                ) : (
                  blockedUsers.map((email) => (
                    <View key={email} style={styles.blockedUserRow}>
                      <Text style={[styles.blockedUserEmail, { color: theme.modalText }]}>{email}</Text>
                      <TouchableOpacity
                        style={styles.unblockBtn}
                        onPress={() => handleUnblockEmail(email)}
                      >
                        <Text style={styles.unblockBtnText}>Unblock</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Emoji Reaction Modal & Block Sender */}
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
            <View style={[styles.reactionModalBox, { backgroundColor: theme.modalBg, borderColor: theme.isDark ? '#333' : '#eee' }]}>
              <Text style={[styles.reactionModalTitle, { color: theme.modalText }]}>React to Message</Text>

              {/* Target Message Preview */}
              {activeReactionItem && (
                <View style={[styles.targetMessagePreview, { backgroundColor: theme.isDark ? '#27223c' : '#f5f5f5' }]}>
                  <Text style={[styles.targetMessageText, { color: theme.modalText }]} numberOfLines={3}>
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
                    style={[styles.reactionModalEmojiBtn, { backgroundColor: theme.isDark ? '#2a2a2a' : '#f8f9fa' }]}
                  >
                    <Text style={styles.reactionModalEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Block Sender Option if not Me */}
              {activeReactionItem && activeReactionItem.userEmail !== userEmail && (
                <TouchableOpacity
                  style={styles.blockSenderOptionBtn}
                  onPress={() => {
                    const sender = activeReactionItem.userEmail;
                    setActiveReactionItem(null);
                    handleBlockEmail(sender);
                  }}
                >
                  <Text style={styles.blockSenderOptionText}>🚫 Block Sender ({activeReactionItem.userEmail})</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Theme Modal */}
        <Modal
          visible={isThemeModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCancelTheme}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>🎨 Custom Themes & Wallpaper</Text>
                <TouchableOpacity onPress={handleCancelTheme}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.themeModalBody}>
                <Text style={[styles.sectionHeader, { color: theme.modalText }]}>Choose Chat Color Theme</Text>
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
                      <Text style={[styles.themeName, { color: t.isDark ? '#ffffff' : '#333333' }]}>{t.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.divider} />

                <Text style={[styles.sectionHeader, { color: theme.modalText }]}>Custom Image Wallpaper</Text>
                <Text style={[styles.sectionSubtext, { color: theme.subtext }]}>Upload photos from your computer as wallpaper!</Text>

                <TouchableOpacity style={styles.uploadWallpaperBtn} onPress={pickCustomWallpaperWeb}>
                  <Text style={styles.uploadWallpaperBtnText}>📷 Upload Custom Image</Text>
                </TouchableOpacity>

                {tempCustomBg && (
                  <TouchableOpacity style={styles.clearWallpaperBtn} onPress={clearTempWallpaper}>
                    <Text style={styles.clearWallpaperBtnText}>🗑️ Remove Wallpaper Image</Text>
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
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.modalText }]}>✏️ Set User Nicknames</Text>
                <TouchableOpacity onPress={() => setNicknameModalVisible(false)}>
                  <Text style={{ color: theme.modalText, fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ paddingVertical: 12 }}>
                <Text style={[styles.sectionSubtext, { color: theme.subtext }]}>Customize display names for your contacts!</Text>

                <Text style={[styles.inputLabel, { color: theme.modalText }]}>Karl's Nickname:</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="Enter Karl's nickname"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
                  value={karlNicknameInput}
                  onChangeText={setKarlNicknameInput}
                />

                <Text style={[styles.inputLabel, { color: theme.modalText, marginTop: 12 }]}>Lezil's Nickname:</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
                  placeholder="Enter Lezil's nickname"
                  placeholderTextColor={theme.isDark ? '#aaaaaa' : '#888888'}
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

        {/* Media Preview Modal */}
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
  bgOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.25)' },
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

  // Segmented Navigation Tab Bar
  segmentedTabBar: {
    flexDirection: 'row',
    padding: 4,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 14,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
  },
  tabBtnTextActive: {
    color: '#0084ff',
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: '#e53935',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 2,
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // People & Friend Requests Tab View
  peopleTabContainer: { padding: 12, gap: 12 },
  peopleCard: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitleText: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSubtext: { fontSize: 12 },

  primaryBtn: {
    backgroundColor: '#0084ff',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.15)',
    gap: 8,
  },
  requestFromText: { fontSize: 14, fontWeight: '700' },
  requestSubtext: { fontSize: 11 },

  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.15)',
    gap: 10,
  },
  friendAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0084ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  friendNameText: { fontSize: 14, fontWeight: '700' },
  friendEmailText: { fontSize: 11 },

  // Messages & Date Header
  listContent: { paddingHorizontal: 10, paddingVertical: 10 },
  itemContainer: { marginBottom: 4 },
  dateHeaderWrap: { alignItems: 'center', marginVertical: 10 },
  dateHeaderPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

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

  senderName: { fontSize: 11, marginBottom: 3, marginLeft: 4, fontWeight: '600' },

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
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: -6,
    borderWidth: 1,
    elevation: 2,
  },
  activeReactionsMe: { marginRight: 6 },
  activeReactionsOther: { marginLeft: 6 },
  activeEmojiText: { fontSize: 12, marginRight: 2 },

  // Room & Block Cards
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(150,150,150,0.1)',
    marginBottom: 6,
    gap: 10,
  },
  roomCardActive: {
    borderWidth: 2,
    borderColor: '#0084ff',
    backgroundColor: 'rgba(0,132,255,0.08)',
  },
  roomIcon: { fontSize: 20 },
  roomTitle: { fontSize: 14, fontWeight: '700' },
  roomSubtext: { fontSize: 11 },

  blockedUserRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(229,57,53,0.08)',
    marginBottom: 6,
  },
  blockedUserEmail: { fontSize: 13, fontWeight: '600' },
  unblockBtn: {
    backgroundColor: '#31a24c',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  unblockBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  blockManagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(229,57,53,0.08)',
  },

  blockSenderOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(229,57,53,0.1)',
    width: '100%',
  },
  blockSenderOptionText: { color: '#e53935', fontWeight: '700', fontSize: 13 },

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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reactionModalBox: {
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
  },
  reactionModalTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  targetMessagePreview: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
    width: '100%',
  },
  targetMessageText: { fontSize: 14, fontStyle: 'italic' },
  reactionEmojiRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  reactionModalEmojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  modalTitle: { fontSize: 17, fontWeight: '700' },
  themeModalBody: { paddingVertical: 8 },
  sectionHeader: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  sectionSubtext: { fontSize: 12, marginBottom: 10 },

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
  themeName: { fontSize: 12, fontWeight: '600' },

  divider: { height: 1, backgroundColor: 'rgba(150,150,150,0.2)', marginVertical: 14 },

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
    backgroundColor: 'rgba(229, 57, 53, 0.1)',
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
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  cancelActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  cancelActionText: { color: '#888', fontWeight: '600', fontSize: 13 },
  saveActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0084ff',
  },
  saveActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  inputLabel: { fontSize: 12, fontWeight: '600' },
  modalInput: {
    borderWidth: 1,
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
