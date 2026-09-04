import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';

const CACHED_MESSAGES_KEY = '@messenger_cached_messages';
const PENDING_QUEUE_KEY = '@messenger_pending_queue';

let syncIntervalId = null;
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
export async function sendOrQueueMessage({ text, mediaUrl = null, mediaType = 'text', userEmail, activeChatEmail = 'lezil@messenger.app' }) {
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = new Date().toISOString();

  const newMessage = {
    id: tempId,
    temp_id: tempId,
    text: text ? text.trim() : '',
    media_url: mediaUrl,
    media_type: mediaType,
    sender_email: userEmail,
    receiver_email: activeChatEmail,
    created_at: timestamp,
    status: 'pending', // 'pending' | 'syncing' | 'sent' | 'failed'
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
  flushPendingQueue();

  return { localMessage: newMessage, allMessages: updated };
}

/**
 * Attempt to flush all items in the pending queue to Supabase
 */
export async function flushPendingQueue(onSyncProgress) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    let pendingQueue = await getPendingQueue();
    if (!pendingQueue || pendingQueue.length === 0) {
      isSyncing = false;
      if (onSyncProgress) onSyncProgress({ isSyncing: false, remaining: 0 });
      return;
    }

    let cachedMessages = await getCachedMessages();
    let remainingQueue = [];

    if (onSyncProgress) onSyncProgress({ isSyncing: true, remaining: pendingQueue.length });

    for (const item of pendingQueue) {
      try {
        // Mark as syncing in local view
        cachedMessages = cachedMessages.map((m) =>
          (m.id === item.id || m.temp_id === item.temp_id) ? { ...m, status: 'syncing' } : m
        );
        await setCachedMessages(cachedMessages);
        if (onSyncProgress) onSyncProgress({ isSyncing: true, remaining: remainingQueue.length + 1 });

        // Push ultra-compact message payload to Supabase
        const payload = {
          text: item.text || '',
          sender_email: item.sender_email,
          receiver_email: item.receiver_email || 'lezil@messenger.app',
          created_at: item.created_at || new Date().toISOString(),
        };

        if (item.media_url) payload.media_url = item.media_url;
        if (item.media_type) payload.media_type = item.media_type;

        const { data, error } = await supabase
          .from('messages')
          .insert([payload])
          .select()
          .single();

        if (error) {
          console.warn('Sync failed for item (re-queuing):', item.id, error.message);
          // Keep in remaining queue with status failed/pending
          remainingQueue.push({ ...item, status: 'pending' });
          cachedMessages = cachedMessages.map((m) =>
            (m.id === item.id || m.temp_id === item.temp_id) ? { ...m, status: 'pending' } : m
          );
        } else {
          // Success! Replace temp item with synced server item
          const syncedMessage = {
            ...data,
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

    if (onSyncProgress) {
      onSyncProgress({
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
 * Start periodic sync loop (e.g. check every 4 seconds for connectivity blips)
 */
export function startOfflineSyncLoop(onSyncProgress, intervalMs = 4000) {
  if (syncIntervalId) clearInterval(syncIntervalId);

  // Trigger initial flush
  flushPendingQueue(onSyncProgress);

  syncIntervalId = setInterval(() => {
    flushPendingQueue(onSyncProgress);
  }, intervalMs);

  return () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  };
}
