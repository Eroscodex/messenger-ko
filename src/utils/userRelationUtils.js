import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

const BLOCKED_USERS_KEY = '@messenger_blocked_users';
const GROUP_CHATS_KEY = '@messenger_group_chats';
const DIRECT_CHATS_KEY = '@messenger_direct_chats';

// Helper for web vs native storage fallback
const getItem = async (key) => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    }
    const val = await AsyncStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    console.error('Storage getItem error:', e);
    return null;
  }
};

const setItem = async (key, value) => {
  try {
    const jsonVal = JSON.stringify(value);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, jsonVal);
      return;
    }
    await AsyncStorage.setItem(key, jsonVal);
  } catch (e) {
    console.error('Storage setItem error:', e);
  }
};

// --- BLOCKED USERS (local only, privacy) ---
export const getBlockedUsers = async () => {
  const list = await getItem(BLOCKED_USERS_KEY);
  return Array.isArray(list) ? list : [];
};

export const blockUser = async (emailToBlock) => {
  if (!emailToBlock) return [];
  const cleanEmail = emailToBlock.trim().toLowerCase();
  const current = await getBlockedUsers();
  if (!current.includes(cleanEmail)) {
    const updated = [...current, cleanEmail];
    await setItem(BLOCKED_USERS_KEY, updated);
    return updated;
  }
  return current;
};

export const unblockUser = async (emailToUnblock) => {
  if (!emailToUnblock) return [];
  const cleanEmail = emailToUnblock.trim().toLowerCase();
  const current = await getBlockedUsers();
  const updated = current.filter((e) => e.toLowerCase() !== cleanEmail);
  await setItem(BLOCKED_USERS_KEY, updated);
  return updated;
};

export const isUserBlocked = (blockedList = [], email = '') => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return blockedList.some((b) => b.toLowerCase() === clean);
};

// --- FRIEND REQUESTS (Supabase-backed, shared across devices) ---
export const getFriendRequests = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return [];

    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`from_email.eq.${user.email},to_email.eq.${user.email}`)
      .eq('status', 'pending');

    if (error) {
      console.warn('getFriendRequests error:', error.message);
      return [];
    }

    // Normalize to { id, from, to, status } shape used by the UI
    return (data || []).map((r) => ({
      id: r.id,
      from: r.from_email,
      to: r.to_email,
      status: r.status,
      createdAt: r.created_at,
    }));
  } catch (e) {
    console.error('getFriendRequests exception:', e);
    return [];
  }
};

export const sendFriendRequest = async (targetEmail, senderEmail = '') => {
  if (!targetEmail) return null;
  const cleanTarget = targetEmail.trim().toLowerCase();
  const cleanSender = senderEmail.trim().toLowerCase();

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .insert([{ from_email: cleanSender, to_email: cleanTarget, status: 'pending' }])
      .select()
      .single();

    if (error) {
      // Already exists? That's fine
      if (error.code === '23505') return { id: null, from: cleanSender, to: cleanTarget, status: 'pending' };
      console.error('sendFriendRequest error:', error.message);
      return null;
    }
    return { id: data.id, from: data.from_email, to: data.to_email, status: data.status };
  } catch (e) {
    console.error('sendFriendRequest exception:', e);
    return null;
  }
};

export const acceptFriendRequest = async (requestObj) => {
  if (!requestObj) return [];
  try {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestObj.id);

    if (error) {
      console.error('acceptFriendRequest error:', error.message);
      return [];
    }

    return await getFriendsList();
  } catch (e) {
    console.error('acceptFriendRequest exception:', e);
    return [];
  }
};

export const rejectFriendRequest = async (requestId) => {
  try {
    await supabase.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
    return await getFriendRequests();
  } catch (e) {
    console.error('rejectFriendRequest exception:', e);
    return [];
  }
};

// --- FRIENDS LIST (Supabase-backed, shared across devices) ---
export const getFriendsList = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return [];

    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_email', user.email);

    if (error) {
      console.warn('getFriendsList error:', error.message);
      return [];
    }

    return (data || []).map((f) => ({
      id: f.id,
      email: f.friend_email,
      name: f.friend_name || f.friend_email.split('@')[0],
      addedAt: f.created_at,
    }));
  } catch (e) {
    console.error('getFriendsList exception:', e);
    return [];
  }
};

// --- GROUP CHATS (Supabase-backed, shared across devices) ---
export const getGroupChats = async () => {
  try {
    const { data, error } = await supabase.rpc('get_my_groups');
    if (error) throw error;
    return (data || []).map((group) => ({
      id: group.group_id,
      name: group.group_name,
      members: group.members || [],
      createdAt: group.group_created_at,
    }));
  } catch (e) {
    console.warn('getGroupChats error:', e.message);
    return [];
  }
};

export const createGroupChat = async (groupName, members = []) => {
  if (!groupName) return null;
  try {
    const { data, error } = await supabase.rpc('create_group_chat', {
      p_name: groupName.trim(),
      p_members: members.map((member) => member.trim().toLowerCase()),
    });
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      members: members.map((member) => member.trim().toLowerCase()),
      createdAt: data.created_at,
    };
  } catch (e) {
    console.error('createGroupChat error:', e.message);
    return null;
  }
};

// --- DIRECT CHATS (1-on-1, local index for sidebar) ---
export const getDirectChats = async () => {
  const list = await getItem(DIRECT_CHATS_KEY);
  return Array.isArray(list) ? list : [];
};

export const addDirectChat = async (targetEmail, nickname = '') => {
  if (!targetEmail) return null;
  const clean = targetEmail.trim().toLowerCase();
  const current = await getDirectChats();
  const existing = current.find((d) => d.email.toLowerCase() === clean);
  if (existing) return existing;

  const newDirect = {
    id: `dm_${clean.replace(/[^a-z0-9]/gi, '_')}`,
    email: clean,
    name: nickname.trim() || clean.split('@')[0],
    createdAt: new Date().toISOString(),
  };
  const updated = [newDirect, ...current];
  await setItem(DIRECT_CHATS_KEY, updated);
  return newDirect;
};
