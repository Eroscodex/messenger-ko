import AsyncStorage from '@react-native-async-storage/async-storage';

const ROOM_SETTINGS_KEY = '@messenger_app_room_settings_v1';
const getAccountKey = (email = '') => email.trim().toLowerCase() || 'guest';

export const getRoomKey = (room = {}) => {
  if (room.type === 'dm') return `dm:${(room.email || room.id || '').trim().toLowerCase()}`;
  if (room.type === 'group') return `group:${room.id}`;
  return 'general';
};

export async function getSavedRoomSettings(accountEmail = '') {
  try {
    const saved = await AsyncStorage.getItem(`${ROOM_SETTINGS_KEY}:${getAccountKey(accountEmail)}`);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
}

export async function saveRoomSettings(accountEmail = '', roomKey, settings = {}) {
  try {
    const current = await getSavedRoomSettings(accountEmail);
    const updated = {
      ...current,
      [roomKey]: {
        ...(current[roomKey] || {}),
        ...settings,
      },
    };
    await AsyncStorage.setItem(`${ROOM_SETTINGS_KEY}:${getAccountKey(accountEmail)}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error saving room settings', e);
    return {};
  }
}
