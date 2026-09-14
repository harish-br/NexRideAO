/**
 * NexRide AO - Central Navigation Service
 * 
 * Provides unified, single-source-of-truth navigation stack management,
 * tab state tracking, modal registration, and browser history synchronization.
 */

class NavigationService {
  constructor() {
    this.screenStack = [];       // Array of { id: string, element: HTMLElement, closeCallback: Function, metadata: Object }
    this.activeModals = [];      // Array of { id: string, element: HTMLElement, closeCallback: Function }
    this.currentTab = 'home';    // 'home' | 'live' | 'profile'
    this.isNavigatingBack = false;
    this.transitionLockTimeout = null;
    this.lockDurationMs = 300;   // Prevents duplicate back trigger races
    this.initialized = false;
    this.customBackInterceptors = []; // Registered interceptors (e.g. unsaved form checks)
  }

  /**
   * Initialize state on app mount
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Check if initial URL has specific tab parameter
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && ['home', 'live', 'profile'].includes(tabParam)) {
          this.currentTab = tabParam;
        }

        // Initialize root history state if clean
        if (!window.history.state || typeof window.history.state.depth === 'undefined') {
          window.history.replaceState({ screen: 'root', tab: this.currentTab, depth: 0 }, '');
        }
      } catch (e) {
        console.warn('[NavigationService] Error during init:', e);
      }
    }
  }

  /**
   * Acquire navigation debounce lock
   */
  acquireLock() {
    if (this.isNavigatingBack) return false;
    this.isNavigatingBack = true;
    clearTimeout(this.transitionLockTimeout);
    this.transitionLockTimeout = setTimeout(() => {
      this.isNavigatingBack = false;
    }, this.lockDurationMs);
    return true;
  }

  /**
   * Release navigation lock immediately
   */
  releaseLock() {
    clearTimeout(this.transitionLockTimeout);
    this.isNavigatingBack = false;
  }

  /**
   * Register a custom back interceptor (e.g. unsaved changes check)
   * Interceptor signature: () => boolean (return true if back was intercepted/handled)
   */
  registerInterceptor(id, fn, priority = 50) {
    this.customBackInterceptors = this.customBackInterceptors.filter(item => item.id !== id);
    this.customBackInterceptors.push({ id, fn, priority });
    this.customBackInterceptors.sort((a, b) => b.priority - a.priority);
  }

  unregisterInterceptor(id) {
    this.customBackInterceptors = this.customBackInterceptors.filter(item => item.id !== id);
  }

  /**
   * Push a screen onto the navigation stack
   */
  push(screenId, closeCallback = null, metadata = {}) {
    this.init();

    // Check if screen is already top of stack
    const top = this.getTopScreen();
    if (top && top.id === screenId) {
      return;
    }

    // Remove if already exists deeper in stack to bring to front
    const existingIndex = this.screenStack.findIndex(s => s.id === screenId);
    if (existingIndex !== -1) {
      this.screenStack.splice(existingIndex, 1);
    }

    const element = typeof document !== 'undefined' ? document.getElementById(screenId) : null;
    const entry = {
      id: screenId,
      element,
      closeCallback,
      metadata: { ...metadata, pushedFromTab: this.currentTab }
    };

    this.screenStack.push(entry);

    if (typeof window !== 'undefined' && window.history) {
      try {
        const depth = this.screenStack.length + this.activeModals.length;
        window.history.pushState({ screen: screenId, depth }, '', window.location.href);
      } catch (err) {
        console.warn('[NavigationService] pushState failed:', err);
      }
    }

    this.logDebug('PUSH_SCREEN', screenId);
  }

  /**
   * Push an active modal/dialog/sheet onto the modal stack
   */
  pushModal(modalId, closeCallback = null) {
    this.init();

    if (this.activeModals.some(m => m.id === modalId)) return;

    const element = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
    this.activeModals.push({ id: modalId, element, closeCallback });

    if (typeof window !== 'undefined' && window.history) {
      try {
        const depth = this.screenStack.length + this.activeModals.length;
        window.history.pushState({ modal: modalId, depth }, '', window.location.href);
      } catch (err) {
        console.warn('[NavigationService] modal pushState failed:', err);
      }
    }

    this.logDebug('PUSH_MODAL', modalId);
  }

  /**
   * Dismiss modal programmatically
   */
  dismissModal(modalId) {
    const idx = this.activeModals.findIndex(m => m.id === modalId);
    if (idx !== -1) {
      const removed = this.activeModals.splice(idx, 1)[0];
      if (removed.closeCallback) {
        try { removed.closeCallback(); } catch (e) { console.error(e); }
      } else if (removed.element) {
        removed.element.classList.remove('active');
      }
      this.logDebug('DISMISS_MODAL', modalId);
    }
  }

  /**
   * Dismiss the topmost active modal
   * Returns true if a modal was closed
   */
  popModal() {
    if (this.activeModals.length === 0) return false;
    const modal = this.activeModals.pop();
    if (modal) {
      if (modal.closeCallback) {
        try { modal.closeCallback(); } catch (e) { console.error(e); }
      } else if (modal.element) {
        modal.element.classList.remove('active');
        const closeBtn = modal.element.querySelector('.report-sheet-close-btn, .report-discard-secondary-btn, .report-lightbox-close');
        if (closeBtn) closeBtn.click();
      }
      this.logDebug('POP_MODAL', modal.id);
      return true;
    }
    return false;
  }

  /**
   * Check if any modal is currently active
   */
  hasActiveModal() {
    if (this.activeModals.length > 0) return true;
    if (typeof document !== 'undefined') {
      const domActiveModal = document.querySelector(
        '#report-category-modal.active, #notif-detail-modal.active, #report-discard-modal.active, #report-attach-sheet-modal.active, #report-image-lightbox.active, #report-edit-details-modal.active, .report-modal-backdrop.active, .report-lightbox-backdrop.active'
      );
      return !!domActiveModal;
    }
    return false;
  }

  /**
   * Close any DOM-active modal found in the document
   */
  closeAnyActiveModal() {
    if (this.popModal()) return true;

    if (typeof document !== 'undefined') {
      const domActiveModals = document.querySelectorAll(
        '#report-category-modal.active, #notif-detail-modal.active, #report-discard-modal.active, #report-attach-sheet-modal.active, #report-image-lightbox.active, #report-edit-details-modal.active, .report-modal-backdrop.active, .report-lightbox-backdrop.active'
      );
      if (domActiveModals && domActiveModals.length > 0) {
        const topModal = domActiveModals[domActiveModals.length - 1];
        topModal.classList.remove('active');
        if (topModal.id === 'report-discard-modal') {
          topModal.style.display = 'none';
        }
        this.logDebug('CLOSED_DOM_MODAL', topModal.id);
        return true;
      }
    }
    return false;
  }

  /**
   * Get top screen from stack
   */
  getTopScreen() {
    return this.screenStack.length > 0
      ? this.screenStack[this.screenStack.length - 1]
      : null;
  }

  /**
   * Pop top screen from stack and invoke close callback
   */
  pop() {
    if (this.screenStack.length === 0) return false;
    const screen = this.screenStack.pop();
    if (screen) {
      if (screen.closeCallback) {
        try { screen.closeCallback(); } catch (e) { console.error(e); }
      } else if (screen.element) {
        screen.element.classList.add('hidden');
        if (screen.element.style.display === 'flex') {
          screen.element.style.display = 'none';
        }
      }
      this.logDebug('POP_SCREEN', screen.id);
      return true;
    }
    return false;
  }

  /**
   * Programmatic user-facing back trigger (e.g. Header "< Back" button or iOS swipe)
   * Syncs via window.history.back() with deterministic fallback if popstate stalls.
   */
  goBack() {
    if (!this.acquireLock()) return;

    if (this.canGoBack()) {
      let popstateFired = false;
      const onPopState = () => {
        popstateFired = true;
      };

      if (typeof window !== 'undefined' && window.history) {
        window.addEventListener('popstate', onPopState, { once: true });
        try {
          window.history.back();
        } catch (e) {
          console.warn('[NavigationService] history.back() error:', e);
        }

        // Failsafe fallback: if history.back does not emit popstate within 80ms
        // (e.g. standalone PWA mode, shallow history state, or browser stall), trigger backHandler directly
        setTimeout(() => {
          window.removeEventListener('popstate', onPopState);
          if (!popstateFired && this.canGoBack()) {
            if (window.backHandler) {
              window.backHandler.handleGlobalBack(false);
            } else {
              this.pop();
            }
          }
        }, 80);
      } else {
        if (typeof window !== 'undefined' && window.backHandler) {
          window.backHandler.handleGlobalBack(false);
        } else {
          this.pop();
        }
      }
    } else {
      this.releaseLock();
    }
  }

  /**
   * Update active bottom tab
   */
  setTab(tabName) {
    if (!['home', 'live', 'profile'].includes(tabName)) return;
    const prevTab = this.currentTab;
    this.currentTab = tabName;

    if (typeof window !== 'undefined' && window.history) {
      try {
        if (tabName !== 'home' && prevTab === 'home') {
          window.history.pushState({ tab: tabName, depth: 1 }, '', window.location.href);
        } else if (tabName === 'home') {
          window.history.replaceState({ screen: 'root', tab: 'home', depth: 0 }, '', window.location.pathname);
        }
      } catch (err) {
        console.warn('[NavigationService] setTab history update error:', err);
      }
    }

    this.logDebug('SET_TAB', `${prevTab} -> ${tabName}`);
  }

  /**
   * Reset entire navigation state on logout
   */
  resetToAuth() {
    this.logDebug('RESET_TO_AUTH', 'Purging protected navigation history');

    // Close all open modals
    while (this.activeModals.length > 0) {
      this.popModal();
    }
    this.closeAnyActiveModal();

    // Close all stack screens
    while (this.screenStack.length > 0) {
      this.pop();
    }

    // Hide all possible protected overlays in DOM
    if (typeof document !== 'undefined') {
      const overlays = document.querySelectorAll('.page-overlay');
      overlays.forEach(overlay => {
        if (overlay.id !== 'auth-page' && overlay.id !== 'otp-page') {
          overlay.classList.add('hidden');
          if (overlay.style.display === 'flex') overlay.style.display = 'none';
        }
      });
    }

    this.currentTab = 'home';

    // Replace history with clean auth state
    if (typeof window !== 'undefined' && window.history) {
      try {
        window.history.replaceState({ screen: 'auth', depth: 0 }, '', window.location.pathname);
      } catch (err) {
        console.warn('[NavigationService] resetToAuth history error:', err);
      }
    }
  }

  /**
   * Returns true if there is any active modal, stack screen, or non-root tab
   */
  canGoBack() {
    if (this.hasActiveModal()) return true;
    if (this.screenStack.length > 0) return true;
    if (this.currentTab !== 'home') return true;
    return false;
  }

  /**
   * Navigation state logging helper
   */
  logDebug(action, detail) {
    const stackStr = this.screenStack.map(s => s.id).join(' > ') || 'Home';
    console.log(`[NAV] ${action}: ${detail} | Tab: ${this.currentTab} | Stack: [${stackStr}] | Modals: ${this.activeModals.length}`);
  }
}

export const navigationService = new NavigationService();
