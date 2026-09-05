import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

// --- BLOCKED USERS ---
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

// --- GROUP CHATS ---
export const getGroupChats = async () => {
  const list = await getItem(GROUP_CHATS_KEY);
  return Array.isArray(list) ? list : [];
};

export const createGroupChat = async (groupName, members = []) => {
  if (!groupName) return null;
  const current = await getGroupChats();
  const newGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: groupName.trim(),
    members: members.map((m) => m.trim().toLowerCase()),
    createdAt: new Date().toISOString(),
  };
  const updated = [newGroup, ...current];
  await setItem(GROUP_CHATS_KEY, updated);
  return newGroup;
};

// --- DIRECT CHATS (1-on-1) ---
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
