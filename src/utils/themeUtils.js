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
    accent: '#0084ff',
    composerBg: '#ffffff',
    inputBg: '#f7f8fc',
    inputBorder: '#e8eaf0',
    inputText: '#1a1a2e',
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
    accent: '#ff4b72',
    composerBg: '#ffffff',
    inputBg: '#fff5f7',
    inputBorder: '#ffccd5',
    inputText: '#2d142c',
    emoji: '🌅',
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyber Neon',
    bg: '#0f0c1b',
    bubbleMe: '#a100ff',
    bubbleOther: '#1f1b2e',
    textMe: '#ffffff',
    textOther: '#e0d8f6',
    headerBg: '#181428',
    headerText: '#ffffff',
    accent: '#00f0ff',
    composerBg: '#181428',
    inputBg: '#27223c',
    inputBorder: '#3b3358',
    inputText: '#ffffff',
    emoji: '⚡',
  },
  dark: {
    id: 'dark',
    name: 'Dark Midnight',
    bg: '#121212',
    bubbleMe: '#3797f0',
    bubbleOther: '#262626',
    textMe: '#ffffff',
    textOther: '#f5f5f5',
    headerBg: '#1e1e1e',
    headerText: '#ffffff',
    accent: '#3797f0',
    composerBg: '#1e1e1e',
    inputBg: '#2a2a2a',
    inputBorder: '#3a3a3a',
    inputText: '#ffffff',
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
    accent: '#2e7d32',
    composerBg: '#ffffff',
    inputBg: '#f1f8e9',
    inputBorder: '#c8e6c9',
    inputText: '#1b5e20',
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
    accent: '#e91e63',
    composerBg: '#ffffff',
    inputBg: '#fce4ec',
    inputBorder: '#f8bbd0',
    inputText: '#880e4f',
    emoji: '💖',
  },
};

const THEME_KEY = '@messenger_app_theme_id';
const BG_IMAGE_KEY = '@messenger_app_custom_bg_image';

export async function getSavedThemeId() {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    return saved && THEMES[saved] ? saved : 'classic';
  } catch (e) {
    return 'classic';
  }
}

export async function saveThemeId(themeId) {
  try {
    await AsyncStorage.setItem(THEME_KEY, themeId);
  } catch (e) {
    console.error('Error saving theme', e);
  }
}

export async function getSavedCustomBg() {
  try {
    return await AsyncStorage.getItem(BG_IMAGE_KEY);
  } catch (e) {
    return null;
  }
}

export async function saveCustomBg(bgUri) {
  try {
    if (bgUri) {
      await AsyncStorage.setItem(BG_IMAGE_KEY, bgUri);
    } else {
      await AsyncStorage.removeItem(BG_IMAGE_KEY);
    }
  } catch (e) {
    console.error('Error saving custom background', e);
  }
}
