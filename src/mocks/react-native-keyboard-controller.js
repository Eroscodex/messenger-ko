// Web stub for react-native-keyboard-controller (no web support)
import React from 'react';
import { View, ScrollView } from 'react-native';

const passThrough = ({ children, style, ...props }) =>
  React.createElement(View, { style, ...props }, children);

const scrollPassThrough = ({ children, style, ...props }) =>
  React.createElement(ScrollView, { style, ...props }, children);

export const KeyboardProvider = passThrough;
export const KeyboardAvoidingView = passThrough;
export const KeyboardStickyView = passThrough;
export const KeyboardAwareScrollView = scrollPassThrough;
export const KeyboardChatScrollView = scrollPassThrough;
export const KeyboardToolbar = () => null;
export const OverKeyboardView = passThrough;
export const KeyboardExtender = () => null;
export const DefaultKeyboardToolbarTheme = {};

// Hooks stubs
export const useKeyboardAnimation = () => ({ height: { value: 0 }, progress: { value: 0 } });
export const useKeyboardHandler = () => {};
export const useKeyboardContext = () => ({});
export const useReanimatedKeyboardAnimation = () => ({ height: { value: 0 }, progress: { value: 0 } });
export const useKeyboardController = () => ({ setEnabled: () => {} });
export const useKeyboardState = () => ({ height: 0, state: 0 });
export const useFocusedInputHandler = () => {};
export const useFocusedInputAccessoryViewHeight = () => 0;

// Constants
export const KeyboardState = { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 };

// Module
export const KeyboardController = {
  setInputMode: () => {},
  setDefaultMode: () => {},
  dismiss: () => {},
};
