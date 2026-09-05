import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

const CACHED_MESSAGES_KEY = '@messenger_cached_messages';
const PENDING_QUEUE_KEY = '@messenger_pending_queue';

let syncIntervalId = null;
let activeSyncProgressCallback = null;
let isSyncing = false;

/**
 * Load locally cached messages from AsyncStorage
 */
export async function getCachedMessages() {
  try {
    const json = await AsyncStorage.getItem(CACHED_MESSAGES_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error reading cached messages:', error);
    return [];
  }
}

/**
 * Save messages to local AsyncStorage
 */
export async function setCachedMessages(messages) {
  try {
    await AsyncStorage.setItem(CACHED_MESSAGES_KEY, JSON.stringify(messages || []));
  } catch (error) {
    console.error('Error saving cached messages:', error);
  }
}

/**
 * Load the queue of messages that failed or were created offline
 */
export async function getPendingQueue() {
  try {
    const json = await AsyncStorage.getItem(PENDING_QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error reading pending queue:', error);
    return [];
  }
}

/**
 * Save pending queue to local AsyncStorage
 */
export async function setPendingQueue(queue) {
  try {
    await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (error) {
    console.error('Error saving pending queue:', error);
  }
}

/**
 * Create a new message offline-first:
 * 1. Generates local temporary message object with status 'pending'
 * 2. Saves to local cached messages list
 * 3. Enqueues to pending queue
 * 4. Triggers background flush attempt immediately
 */
export async function sendOrQueueMessage({ text, mediaUrl = null, mediaType = 'text', userEmail, roomId = 'general', recipientEmail = null }) {
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = new Date().toISOString();

  const newMessage = {
    id: tempId,
    temp_id: tempId,
    text: text ? text.trim() : '',
    user_email: userEmail || 'user@messenger.app',
    image_url: mediaUrl,
    video_url: null,
    room_id: roomId,
    recipient_email: recipientEmail,
    created_at: timestamp,
    status: 'pending', // 'pending' | 'syncing' | 'sent'
  };

  // 1. Update local cached messages
  const existing = await getCachedMessages();
  const updated = [...existing, newMessage];
  await setCachedMessages(updated);

  // 2. Add to pending queue
  const pendingQueue = await getPendingQueue();
  pendingQueue.push(newMessage);
  await setPendingQueue(pendingQueue);

  // 3. Attempt immediate sync in background
  flushPendingQueue(activeSyncProgressCallback);

  return { localMessage: newMessage, allMessages: updated };
}

/**
 * Attempt to flush all items in the pending queue to Supabase
 */
export async function flushPendingQueue(onSyncProgress) {
  if (onSyncProgress) activeSyncProgressCallback = onSyncProgress;

  if (isSyncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const pendingQueue = await getPendingQueue();
    if (activeSyncProgressCallback) {
      activeSyncProgressCallback({ isSyncing: false, remaining: pendingQueue.length });
    }
    return;
  }
  isSyncing = true;

  try {
    let pendingQueue = await getPendingQueue();
    if (!pendingQueue || pendingQueue.length === 0) {
      isSyncing = false;
      if (activeSyncProgressCallback) activeSyncProgressCallback({ isSyncing: false, remaining: 0 });
      return;
    }

    let cachedMessages = await getCachedMessages();
    let remainingQueue = [];

    if (activeSyncProgressCallback) activeSyncProgressCallback({ isSyncing: true, remaining: pendingQueue.length });

    for (const item of pendingQueue) {
      try {
        // Mark as syncing in local view
        cachedMessages = cachedMessages.map((m) =>
          (m.id === item.id || m.temp_id === item.temp_id) ? { ...m, status: 'syncing' } : m
        );
        await setCachedMessages(cachedMessages);
        if (activeSyncProgressCallback) activeSyncProgressCallback({ isSyncing: true, remaining: remainingQueue.length });

        // Correct Supabase database payload matching schema: { text, user_email, image_url, video_url }
        const payload = {
          text: item.text || '',
          user_email: item.user_email || item.sender_email || item.userEmail || 'user@messenger.app',
          image_url: item.image_url || item.media_url || null,
          video_url: item.video_url || null,
          room_id: item.room_id || 'general',
          recipient_email: item.recipient_email || null,
        };

        const { data, error } = await supabase
          .from('messages')
          .insert([payload])
          .select()
          .single();

        if (error) {
          console.warn('Sync failed for item (re-queuing):', item.id, error.message);
          remainingQueue.push({ ...item, status: 'pending' });
          cachedMessages = cachedMessages.map((m) =>
            (m.id === item.id || m.temp_id === item.temp_id) ? { ...m, status: 'pending' } : m
          );
        } else {
          // Success! Replace temp item with synced server item
          const syncedMessage = {
            ...data,
            id: String(data.id),
            status: 'sent',
          };
          cachedMessages = cachedMessages.map((m) =>
            (m.id === item.id || m.temp_id === item.temp_id) ? syncedMessage : m
          );
        }
      } catch (err) {
        console.warn('Network error while flushing message:', err);
        remainingQueue.push({ ...item, status: 'pending' });
        cachedMessages = cachedMessages.map((m) =>
          (m.id === item.id || m.temp_id === item.temp_id) ? { ...m, status: 'pending' } : m
        );
      }
    }

    await setCachedMessages(cachedMessages);
    await setPendingQueue(remainingQueue);

    if (activeSyncProgressCallback) {
      activeSyncProgressCallback({
        isSyncing: false,
        remaining: remainingQueue.length,
      });
    }
  } catch (globalErr) {
    console.error('Error during flushPendingQueue:', globalErr);
  } finally {
    isSyncing = false;
  }
}

/**
 * Start periodic sync loop and attach browser online listeners
 */
export function startOfflineSyncLoop(onSyncProgress, intervalMs = 3000) {
  activeSyncProgressCallback = onSyncProgress;
  if (syncIntervalId) clearInterval(syncIntervalId);

  // Trigger initial flush
  flushPendingQueue(onSyncProgress);

  syncIntervalId = setInterval(() => {
    flushPendingQueue(onSyncProgress);
  }, intervalMs);

  // Browser online listener
  let handleOnline = null;
  if (typeof window !== 'undefined' && window.addEventListener) {
    handleOnline = () => {
      flushPendingQueue(onSyncProgress);
    };
    window.addEventListener('online', handleOnline);
  }

  return () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (handleOnline && typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('online', handleOnline);
    }
  };
}
