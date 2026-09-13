/**
 * js/offline/connectivity.js
 * Centralized network & backend connectivity monitoring service.
 * Verifies true server reachability with active probing instead of
 * blindly relying on navigator.onLine.
 */

class ConnectivityService {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isServerReachable = this.isOnline;
    this.lastSuccessfulSync = Date.now();
    this.isChecking = false;
    this.listeners = new Set();
    this.consecutiveFailures = 0;
    this.heartbeatTimer = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));

      // Periodic reachability check every 25s when online, every 8s when offline
      this.startHeartbeat();
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const interval = this.isServerReachable ? 25000 : 8000;
    this.heartbeatTimer = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        this.checkReachability();
      }
    }, interval);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    // Immediately emit current state
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  notify(eventDetails = {}) {
    const state = { ...this.getState(), ...eventDetails };
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('[Connectivity] Listener error:', err);
      }
    });
  }

  getState() {
    return {
      isOnline: this.isOnline,
      isServerReachable: this.isServerReachable,
      lastSuccessfulSync: this.lastSuccessfulSync,
      isChecking: this.isChecking,
      consecutiveFailures: this.consecutiveFailures
    };
  }

  async handleNetworkChange(online) {
    this.isOnline = online;
    if (!online) {
      this.isServerReachable = false;
      this.consecutiveFailures++;
      console.log('[OFFLINE] Network interface disconnected');
      this.notify({ event: 'offline' });
      this.startHeartbeat();
    } else {
      console.log('[Connectivity] Interface came online, verifying reachability...');
      await this.checkReachability();
    }
  }

  /**
   * Actively probes the server to verify internet and backend reachability.
   * Uses a fast HEAD/GET request with cache busting and a short timeout.
   */
  async checkReachability(isUserAction = false) {
    if (this.isChecking) return this.isServerReachable;
    this.isChecking = true;

    if (isUserAction) {
      this.notify({ event: 'refreshing' });
    }

    let reachable = false;

    // If browser explicitly says offline, no need to probe
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      reachable = false;
    } else {
      try {
        // Probe endpoint with 4-second timeout: lightweight ping to a static asset or origin
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        // Ping origin with cache busting
        const pingUrl = `/favicon.ico?_ping=${Date.now()}`;
        const response = await fetch(pingUrl, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        reachable = response.ok || response.status === 304 || response.status === 404; // Any HTTP response proves server reachability
      } catch (err) {
        // Fallback probe to cloudflare/google if localhost proxy fails
        try {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
          await fetch('https://www.gstatic.com/generate_204', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller2.signal
          });
          clearTimeout(timeoutId2);
          reachable = true;
        } catch (e) {
          reachable = false;
        }
      }
    }

    this.isChecking = false;
    const previous = this.isServerReachable;
    this.isServerReachable = reachable;

    if (reachable) {
      this.consecutiveFailures = 0;
      this.lastSuccessfulSync = Date.now();
      if (!previous) {
        console.log('[Connectivity] Server reachability restored! [ONLINE]');
        this.notify({ event: 'back_online' });
      } else if (isUserAction) {
        this.notify({ event: 'already_online' });
      }
    } else {
      this.consecutiveFailures++;
      console.log(`[OFFLINE] Server unreachable (attempts: ${this.consecutiveFailures})`);
      if (isUserAction) {
        this.notify({ event: 'still_offline' });
      } else {
        this.notify({ event: 'offline' });
      }
    }

    this.startHeartbeat();
    return reachable;
  }

  recordSuccessfulSync() {
    this.lastSuccessfulSync = Date.now();
    this.isServerReachable = true;
    this.consecutiveFailures = 0;
  }
}

export const connectivity = new ConnectivityService();
