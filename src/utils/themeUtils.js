import AsyncStorage from '@react-native-async-storage/async-storage';

export const THEMES = {
  classic: {
    id: 'classic',
    name: 'Classic Blue',
    bg: '#f0f4ff',
    bubbleMe: '#0084ff',
    bubbleOther: '#ffffff',
    textMe: '#ffffff',
    textOther: '#1a1a2e',
    headerBg: '#ffffff',
    headerText: '#1a1a2e',
    senderName: '#555555',
    subtext: '#888888',
    dateHeaderBg: 'rgba(0, 0, 0, 0.12)',
    dateHeaderText: '#444444',
    accent: '#0084ff',
    composerBg: '#ffffff',
    inputBg: '#f7f8fc',
    inputBorder: '#e8eaf0',
    inputText: '#1a1a2e',
    activeReactionBg: '#ffffff',
    modalBg: '#ffffff',
    modalText: '#1a1a2e',
    isDark: false,
    emoji: '💙',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Pink',
    bg: '#fff0f3',
    bubbleMe: '#ff4b72',
    bubbleOther: '#ffffff',
    textMe: '#ffffff',
    textOther: '#2d142c',
    headerBg: '#ffffff',
    headerText: '#2d142c',
    senderName: '#664055',
    subtext: '#886075',
    dateHeaderBg: 'rgba(255, 75, 114, 0.15)',
    dateHeaderText: '#882040',
    accent: '#ff4b72',
    composerBg: '#ffffff',
    inputBg: '#fff5f7',
    inputBorder: '#ffccd5',
    inputText: '#2d142c',
    activeReactionBg: '#ffffff',
    modalBg: '#ffffff',
    modalText: '#2d142c',
    isDark: false,
    emoji: '🌅',
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyber Neon',
    bg: '#0f0c1b',
    bubbleMe: '#a100ff',
    bubbleOther: '#1f1b2e',
    textMe: '#ffffff',
    textOther: '#ffffff',
    headerBg: '#181428',
    headerText: '#ffffff',
    senderName: '#00f0ff',
    subtext: '#b0a0d0',
    dateHeaderBg: 'rgba(161, 0, 255, 0.35)',
    dateHeaderText: '#00f0ff',
    accent: '#00f0ff',
    composerBg: '#181428',
    inputBg: '#27223c',
    inputBorder: '#3b3358',
    inputText: '#ffffff',
    activeReactionBg: '#27223c',
    modalBg: '#181428',
    modalText: '#ffffff',
    isDark: true,
    emoji: '⚡',
  },
  dark: {
    id: 'dark',
    name: 'Dark Midnight',
    bg: '#121212',
    bubbleMe: '#3797f0',
    bubbleOther: '#262626',
    textMe: '#ffffff',
    textOther: '#ffffff',
    headerBg: '#1e1e1e',
    headerText: '#ffffff',
    senderName: '#cccccc',
    subtext: '#aaaaaa',
    dateHeaderBg: 'rgba(255, 255, 255, 0.18)',
    dateHeaderText: '#ffffff',
    accent: '#3797f0',
    composerBg: '#1e1e1e',
    inputBg: '#2a2a2a',
    inputBorder: '#3a3a3a',
    inputText: '#ffffff',
    activeReactionBg: '#2a2a2a',
    modalBg: '#1e1e1e',
    modalText: '#ffffff',
    isDark: true,
    emoji: '🌙',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Garden',
    bg: '#e8f5e9',
    bubbleMe: '#2e7d32',
    bubbleOther: '#ffffff',
    textMe: '#ffffff',
    textOther: '#1b5e20',
    headerBg: '#ffffff',
    headerText: '#1b5e20',
    senderName: '#2e7d32',
    subtext: '#558b2f',
    dateHeaderBg: 'rgba(46, 125, 50, 0.15)',
    dateHeaderText: '#1b5e20',
    accent: '#2e7d32',
    composerBg: '#ffffff',
    inputBg: '#f1f8e9',
    inputBorder: '#c8e6c9',
    inputText: '#1b5e20',
    activeReactionBg: '#ffffff',
    modalBg: '#ffffff',
    modalText: '#1b5e20',
    isDark: false,
    emoji: '🌿',
  },
  love: {
    id: 'love',
    name: 'Love & Hearts 💕',
    bg: '#fff0f5',
    bubbleMe: '#e91e63',
    bubbleOther: '#ffffff',
    textMe: '#ffffff',
    textOther: '#880e4f',
    headerBg: '#ffffff',
    headerText: '#880e4f',
    senderName: '#ad1457',
    subtext: '#c2185b',
    dateHeaderBg: 'rgba(233, 30, 99, 0.15)',
    dateHeaderText: '#880e4f',
    accent: '#e91e63',
    composerBg: '#ffffff',
    inputBg: '#fce4ec',
    inputBorder: '#f8bbd0',
    inputText: '#880e4f',
    activeReactionBg: '#ffffff',
    modalBg: '#ffffff',
    modalText: '#880e4f',
    isDark: false,
    emoji: '💖',
  },
};

const THEME_KEY = '@messenger_app_theme_id';
const BG_IMAGE_KEY = '@messenger_app_custom_bg_image';
const getAccountKey = (email = '') => email.trim().toLowerCase() || 'guest';

export async function getSavedThemeId(accountEmail = '') {
  try {
    const saved = await AsyncStorage.getItem(`${THEME_KEY}:${getAccountKey(accountEmail)}`);
    return saved && THEMES[saved] ? saved : 'classic';
  } catch (e) {
    return 'classic';
  }
}

export async function saveThemeId(themeId, accountEmail = '') {
  try {
    await AsyncStorage.setItem(`${THEME_KEY}:${getAccountKey(accountEmail)}`, themeId);
  } catch (e) {
    console.error('Error saving theme', e);
  }
}

export async function getSavedCustomBg(accountEmail = '') {
  try {
    return await AsyncStorage.getItem(`${BG_IMAGE_KEY}:${getAccountKey(accountEmail)}`);
  } catch (e) {
    return null;
  }
}

export async function saveCustomBg(bgUri, accountEmail = '') {
  try {
    const key = `${BG_IMAGE_KEY}:${getAccountKey(accountEmail)}`;
    if (bgUri) {
      await AsyncStorage.setItem(key, bgUri);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (e) {
    console.error('Error saving custom background', e);
  }
}
