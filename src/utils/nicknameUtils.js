import AsyncStorage from '@react-native-async-storage/async-storage';

const NICKNAMES_KEY = '@messenger_app_nicknames_v2';
const getAccountKey = (email = '') => email.trim().toLowerCase() || 'guest';

export async function getSavedNicknames(accountEmail = '') {
  try {
    const saved = await AsyncStorage.getItem(`${NICKNAMES_KEY}:${getAccountKey(accountEmail)}`);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
}

export async function saveNickname(keyOrEmail, nickname, accountEmail = '') {
  try {
    const current = await getSavedNicknames(accountEmail);
    const cleanKey = keyOrEmail.trim().toLowerCase();
    const updated = { ...current, [cleanKey]: nickname.trim() };
    await AsyncStorage.setItem(`${NICKNAMES_KEY}:${getAccountKey(accountEmail)}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error saving nickname', e);
    return {};
  }
}

export function getDisplayName(email, nicknamesMap = {}) {
  if (!email) return 'User';
  const cleanEmail = email.toLowerCase();

  // 1. Exact email match
  if (nicknamesMap[cleanEmail]) {
    return nicknamesMap[cleanEmail];
  }

  // 2. Prefix match (e.g. 'karl' or 'lezil')
  const prefix = cleanEmail.split('@')[0];
  if (nicknamesMap[prefix]) {
    return nicknamesMap[prefix];
  }

  // 3. Smart default for Karl & Lezil
  if (cleanEmail.includes('karl')) {
    return nicknamesMap['karl'] || 'Karl 💙';
  }
  if (cleanEmail.includes('lezil')) {
    return nicknamesMap['lezil'] || 'Lezil 💕';
  }

  // 4. Fallback: Capitalized prefix
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}
