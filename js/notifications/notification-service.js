/**
 * js/notifications/notification-service.js
 * Client-side Notification Service for NexRide (User App & Admin Panel).
 * Coordinates FCM token generation, permission management, in-app foreground toasts,
 * and offline-capable notification center synchronization.
 */

import { app } from '../firebase-config.js';
import { repository } from '../offline/repository.js';
import { resolveNotificationRoute } from './notification-types.js';

class NotificationClientService {
  constructor() {
    this.messaging = null;
    this.currentToken = null;
    this.currentUser = null;
    this.currentUserRole = 'user';
    this.notifications = [];
    this.unreadCount = 0;
    this.listeners = new Set();
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    this.toastContainer = null;
  }

  /**
   * Initializes Firebase Messaging if supported by the browser environment.
   */
  async initialize(user, role = 'user') {
    this.currentUser = user;
    this.currentUserRole = role;

    if (!this.isSupported) {
      console.log('[FCM Client] Push notifications not supported in this environment');
      return;
    }

    try {
      // Dynamic import of Firebase Messaging SDK from CDN
      const { getMessaging, isSupported: checkMessagingSupported } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js');

      const supported = await checkMessagingSupported().catch(() => false);
      if (supported && app) {
        this.messaging = getMessaging(app);
        this.setupForegroundListener();
      }
    } catch (err) {
      console.warn('[FCM Client] Firebase messaging initialization skipped:', err.message);
    }

    // Auto-register if permission already granted
    if (Notification.permission === 'granted' && user) {
      await this.registerDeviceToken();
    }

    // Load initial notifications (offline-first with SWR)
    if (user) {
      await this.syncNotifications();
    }
  }

  /**
   * Requests notification permission at an appropriate user experience moment.
   */
  async requestPermission() {
    if (!this.isSupported) return false;

    if (Notification.permission === 'granted') {
      await this.registerDeviceToken();
      return true;
    }

    if (Notification.permission === 'denied') {
      console.log('[FCM Client] Notification permission was previously denied');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.registerDeviceToken();
        await this.showSystemNotification({
          title: 'NexRide Transit System',
          body: 'Notifications enabled! Real-time bus alerts & tracking active on your device.'
        });
        return true;
      }
    } catch (err) {
      console.warn('[FCM Client] Error requesting permission:', err);
    }
    return false;
  }

  /**
   * Triggers a genuine Operating System UI notification (macOS / Windows / Android).
   * Rendered natively by the OS notification system outside the app's DOM.
   */
  async showSystemNotification(notification = {}) {
    if (!this.isSupported || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return false;
    }

    const title = notification.title || 'NexRide Transit';
    const options = {
      body: notification.body || 'Live bus tracking, route alerts, and transit updates active.',
      icon: '/icon-192.png',
      badge: '/favicon/favicon-96x96.png',
      tag: notification.tag || `nexride_${Date.now()}`,
      data: notification.data || { screen: 'live' },
      renotify: true
    };

    // 1. Try Service Worker showNotification (standard for PWA / background push)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return true;
        }
      }
    } catch (swErr) {
      console.warn('[FCM Client] ServiceWorker showNotification note:', swErr.message);
    }

    // 2. Fallback to standard Window Notification API
    try {
      const nativeNotif = new Notification(title, options);
      nativeNotif.onclick = () => {
        window.focus();
        if (notification.data?.screen) {
          window.location.hash = notification.data.screen.replace(/^\/#?/, '');
        }
      };
      return true;
    } catch (err) {
      console.warn('[FCM Client] Native Notification constructor note:', err.message);
    }
    return false;
  }

  /**
   * Prompts the native system OS / browser permission dialog immediately when the user enters the app.
   * Does not display in-app notification banners.
   */
  triggerSystemPromptOnAppEntry() {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    if (Notification.permission !== 'default') return;

    let hasRequested = false;

    const askPermission = async () => {
      if (hasRequested || Notification.permission !== 'default') return;
      hasRequested = true;

      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await this.registerDeviceToken();
        }
      } catch (err) {
        console.warn('[FCM Client] System entry notification prompt note:', err.message);
      }
    };

    // 1. Prompt immediately on entry
    askPermission();

    // 2. Also bind to first interaction if browser strictly requires a user gesture
    const gestureEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
    const handleGesture = () => {
      askPermission();
      gestureEvents.forEach(evt => window.removeEventListener(evt, handleGesture));
    };
    gestureEvents.forEach(evt => window.addEventListener(evt, handleGesture, { once: true, passive: true }));
  }

  /**
   * Generates or retrieves the FCM device token.
   */
  async getToken() {
    if (!this.messaging) return null;

    try {
      const { getToken } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js');
      const swRegistration = await navigator.serviceWorker.ready;

      const tokenOptions = {
        serviceWorkerRegistration: swRegistration
      };

      let vapidKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY;
      if (vapidKey) {
        tokenOptions.vapidKey = String(vapidKey).replace(/^["']|["']$/g, '').trim();
      }

      const token = await getToken(this.messaging, tokenOptions);
      this.currentToken = token;
      return token;
    } catch (err) {
      console.warn('[FCM Client] Failed to retrieve FCM device token:', err.message);
      return null;
    }
  }

  /**
   * Sends token to backend to associate with current user / admin.
   */
  async registerDeviceToken() {
    if (!this.currentUser) return;

    const token = await this.getToken();
    if (!token) return;

    try {
      const payload = {
        ownerId: this.currentUser.uid,
        ownerType: this.currentUserRole,
        token: token,
        platform: 'web',
        deviceId: this.getDeviceId()
      };

      const response = await fetch('/api/notifications/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.currentUser.uid,
          'x-user-role': this.currentUserRole
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[FCM Client] Token successfully registered on backend for ${this.currentUserRole}`);
      }
    } catch (err) {
      console.warn('[FCM Client] Error registering device token on backend:', err.message);
    }
  }

  /**
   * Deactivates device token association on logout.
   */
  async unregisterDeviceToken() {
    if (!this.currentToken || !this.currentUser) return;

    try {
      await fetch('/api/notifications/unregister-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.currentUser.uid,
          'x-user-role': this.currentUserRole
        },
        body: JSON.stringify({
          token: this.currentToken,
          ownerId: this.currentUser.uid
        })
      });

      console.log('[FCM Client] Device token unregistered upon logout');
    } catch (err) {
      console.warn('[FCM Client] Error unregistering device token:', err.message);
    } finally {
      this.currentToken = null;
      this.currentUser = null;
    }
  }

  /**
   * Generates or retrieves a persistent browser device fingerprint ID.
   */
  getDeviceId() {
    let id = localStorage.getItem('nexride_device_id');
    if (!id) {
      id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem('nexride_device_id', id);
    }
    return id;
  }

  /**
   * Sets up listener for incoming foreground FCM messages.
   */
  async setupForegroundListener() {
    if (!this.messaging) return;

    try {
      const { onMessage } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js');

      onMessage(this.messaging, (payload) => {
        console.log('[FCM Client] Foreground push received:', payload);

        const notifData = {
          id: payload.messageId || `fcm_${Date.now()}`,
          title: payload.notification?.title || payload.data?.title || 'NexRide Notification',
          body: payload.notification?.body || payload.data?.body || '',
          type: payload.data?.type || 'SYSTEM_ALERT',
          data: payload.data || {},
          read: false,
          createdAt: Date.now()
        };

        // Add to local state and notify listeners
        this.notifications.unshift(notifData);
        this.unreadCount++;
        this.notifySubscribers();

        // Display non-intrusive in-app toast
        this.showInAppToast(notifData);
      });
    } catch (err) {
      console.warn('[FCM Client] Error binding onMessage listener:', err);
    }
  }

  /**
   * Loads notifications using Stale-While-Revalidate pattern (works offline!).
   */
  async syncNotifications() {
    if (!this.currentUser) return;

    const cacheKey = `notifications_${this.currentUser.uid}`;

    try {
      const { data, isFromCache } = await repository.getWithSWR(
        cacheKey,
        async () => {
          const res = await fetch(`/api/notifications?recipientId=${encodeURIComponent(this.currentUser.uid)}&recipientType=${this.currentUserRole}`, {
            headers: {
              'x-user-id': this.currentUser.uid,
              'x-user-role': this.currentUserRole
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.json();
          return body.notifications || [];
        },
        { ttlMs: 15000 }
      );

      this.notifications = Array.isArray(data) ? data : [];
      this.unreadCount = this.notifications.filter(n => !n.read).length;
      this.notifySubscribers();
      console.log(`[FCM Client] Notifications loaded (${this.notifications.length} items, source: ${isFromCache ? 'cache' : 'server'})`);
    } catch (err) {
      console.warn('[FCM Client] Failed to fetch fresh notifications, preserving cached:', err.message);
    }
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(notificationId) {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif && !notif.read) {
      notif.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notifySubscribers();
    }

    try {
      await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'PATCH',
        headers: {
          'x-user-id': this.currentUser?.uid || '',
          'x-user-role': this.currentUserRole
        }
      });
    } catch (err) {
      console.warn('[FCM Client] Error marking notification read on server:', err.message);
    }
  }

  /**
   * Marks all notifications as read.
   */
  async markAllAsRead() {
    this.notifications.forEach(n => { n.read = true; });
    this.unreadCount = 0;
    this.notifySubscribers();

    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': this.currentUser?.uid || '',
          'x-user-role': this.currentUserRole
        },
        body: JSON.stringify({ recipientId: this.currentUser?.uid })
      });
    } catch (err) {
      console.warn('[FCM Client] Error marking all read on server:', err.message);
    }
  }

  /**
   * Subscribes UI components to notification state updates.
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback({
      notifications: this.notifications,
      unreadCount: this.unreadCount
    });
    return () => this.listeners.delete(callback);
  }

  notifySubscribers() {
    const state = {
      notifications: this.notifications,
      unreadCount: this.unreadCount
    };
    this.listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error(e); }
    });
    this.updateBadges();
  }

  /**
   * Synchronizes unread badges in both User and Admin UI headers.
   */
  updateBadges() {
    if (typeof document === 'undefined') return;

    // User home badge
    const userBadge = document.getElementById('home-notif-badge');
    if (userBadge) {
      userBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      userBadge.style.display = this.unreadCount > 0 ? 'inline-flex' : 'none';
    }

    // Admin header badge
    const adminBadge = document.getElementById('admin-notif-badge');
    if (adminBadge) {
      adminBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      adminBadge.style.display = this.unreadCount > 0 ? 'inline-flex' : 'none';
    }
  }

  /**
   * Displays an elegant in-app toast when a foreground notification is received.
   */
  showInAppToast(notification, isManualTest = false) {
    if (typeof document === 'undefined') return;

    // Filter by user preferences
    if (!isManualTest) {
      try {
        const cached = JSON.parse(localStorage.getItem('nexride_user_profile') || '{}');
        const prefs = cached.preferences;
        if (prefs) {
          if (prefs.notificationsEnabled === false) return;
          const type = String(notification?.type || '').toUpperCase();
          if ((type.includes('BUS') || type.includes('ARRIVAL') || type.includes('PROXIMITY')) && prefs.busAlerts === false) return;
          if ((type.includes('DELAY') || type.includes('SCHEDULE') || type.includes('DETOUR')) && prefs.delayAlerts === false) return;
          if ((type.includes('ANNOUNCEMENT') || type.includes('BROADCAST') || type.includes('CAMPUS')) && prefs.announcements === false) return;
          if ((type.includes('SAFETY') || type.includes('EMERGENCY')) && prefs.safetyAlerts === false) return;
        }
      } catch (e) {}
    }

    // Play subtle audio chime if sound preference is enabled
    try {
      const cached = JSON.parse(localStorage.getItem('nexride_user_profile') || '{}');
      const prefs = cached.preferences || {};
      if (prefs.sound !== false && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
      if (prefs.hapticFeedback !== false && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([25, 30, 25]);
      }
    } catch (e) {}

    let container = document.getElementById('nr-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'nr-toast-container';
      container.style.cssText = `
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 16px);
        right: 16px;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 360px;
        width: calc(100% - 32px);
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'nr-notification-toast';
    toast.style.cssText = `
      background: #FFFFFF;
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      pointer-events: auto;
      cursor: pointer;
      transform: translateY(-20px);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    `;

    toast.innerHTML = `
      <div style="width: 36px; height: 36px; border-radius: 10px; background: #EFF6FF; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <img src="/notification.svg" alt="Notification" style="width: 20px; height: 20px;" />
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${this.escapeHtml(notification.title)}
        </div>
        <div style="font-size: 12.5px; color: #4B5563; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${this.escapeHtml(notification.body)}
        </div>
      </div>
    `;

    toast.addEventListener('click', () => {
      this.markAsRead(notification.id);
      const dest = resolveNotificationRoute(notification.type, notification.data?.id);
      if (dest) {
        window.location.hash = dest.replace(/^\/#?/, '');
      }
      toast.remove();
    });

    container.appendChild(toast);

    // Animate enter
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    // Auto-dismiss after 5s
    setTimeout(() => {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const notificationClient = new NotificationClientService();
