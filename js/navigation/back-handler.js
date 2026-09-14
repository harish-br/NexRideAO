/**
 * NexRide AO - Central Back Handler
 * 
 * Implements the strict priority chain for Android physical back button,
 * Android back gesture, and centralized programmatic back navigation.
 */

import { navigationService } from './navigation-service.js';

class BackHandler {
  constructor() {
    this.lastRootBackPressTime = 0;
    this.doubleBackExitThresholdMs = 2000;
    this.toastElement = null;
    this.toastTimeout = null;
    this.isListening = false;
  }

  /**
   * Register popstate listener on window
   */
  init() {
    if (this.isListening) return;
    this.isListening = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', (event) => {
        this.handlePopState(event);
      });
      console.log('[BackHandler] Global popstate listener registered for system back');
    }
  }

  /**
   * Main entry point when browser/OS fires popstate event
   */
  handlePopState(event) {
    const handled = this.handleGlobalBack(true);
    if (!handled) {
      console.log('[BackHandler] System back passed through to OS exit');
    }
  }

  /**
   * Execute the priority-ordered back navigation chain.
   * Returns true if the back event was consumed/handled, false if allowed to exit OS.
   */
  handleGlobalBack(fromPopState = false) {
    // 1. Is a modal / bottom sheet / lightbox / dialog open?
    if (this.handleModalBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Dismissed active modal');
      return true;
    }

    // 2. Is the Home sheet (#content-container) expanded to FULL snap point?
    if (this.handleDraggableSheetBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Collapsed draggable sheet to DEFAULT');
      return true;
    }

    // 3. Is keyboard / active input focused?
    if (this.handleKeyboardBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Dismissed keyboard / blurred input');
      // If triggered from popstate, push back state so blur doesn't pop the screen
      if (fromPopState && typeof window !== 'undefined' && window.history) {
        const top = navigationService.getTopScreen();
        const depth = navigationService.screenStack.length;
        window.history.pushState({ screen: top ? top.id : 'root', depth }, '', window.location.href);
      }
      return true;
    }

    // 4. Is WebView / iframe present and able to go back?
    if (this.handleWebViewBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Navigated back in iframe / WebView');
      return true;
    }

    // 5. Custom back interceptors (e.g. unsaved form confirmation)
    if (this.handleCustomInterceptors()) {
      navigationService.logDebug('BACK_HANDLED', 'Custom interceptor consumed back event');
      if (fromPopState && typeof window !== 'undefined' && window.history) {
        const top = navigationService.getTopScreen();
        const depth = navigationService.screenStack.length;
        window.history.pushState({ screen: top ? top.id : 'root', depth }, '', window.location.href);
      }
      return true;
    }

    // 6. Does current navigation stack have an active child screen?
    if (this.handleStackBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Popped top screen from stack');
      return true;
    }

    // 7. Are we on a non-root tab (Live or Profile)?
    if (this.handleNonRootTabBack()) {
      navigationService.logDebug('BACK_HANDLED', 'Navigated back from non-root tab to Home tab');
      return true;
    }

    // 8. We are on the root Home screen -> Apply double-back-to-exit protection
    return this.handleRootBack(fromPopState);
  }

  /**
   * Priority 1: Dismiss active modal / bottom sheet
   */
  handleModalBack() {
    return navigationService.closeAnyActiveModal();
  }

  /**
   * Priority 2: Collapse draggable home sheet to default snap if expanded
   */
  handleDraggableSheetBack() {
    if (typeof document === 'undefined') return false;
    const container = document.getElementById('content-container');
    if (!container) return false;

    // Check if the container is currently at or near the FULL snap point
    // In sheet.js, snapPoints.FULL is -(window.innerHeight - topSafeArea - headerGap)
    // We check transform style
    const transform = container.style.transform;
    if (transform && transform.includes('translateY')) {
      const match = transform.match(/translateY\((-?\d+(?:\.\d+)?)(?:px|vh|%)\)/);
      if (match) {
        const currentY = parseFloat(match[1]);
        const vh60 = -(window.innerHeight * 0.6);
        // If sheet is dragged above default height (more negative translateY)
        if (currentY < vh60 - 50) {
          // Collapse to default
          container.classList.add('animating');
          container.style.transform = `translateY(${vh60}px)`;
          const myLocationBtn = document.getElementById('my-location-btn');
          if (myLocationBtn) {
            myLocationBtn.style.opacity = '1';
            myLocationBtn.style.pointerEvents = 'auto';
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Priority 3: Dismiss keyboard / active input focus
   */
  handleKeyboardBack() {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      active.blur();
      return true;
    }
    return false;
  }

  /**
   * Priority 4: Navigate back in iframe / WebView if present
   */
  handleWebViewBack() {
    if (typeof document === 'undefined') return false;
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow && iframe.contentWindow.history && iframe.contentWindow.history.length > 1) {
          iframe.contentWindow.history.back();
          return true;
        }
      } catch (e) {
        // Cross-origin iframe security block - ignore
      }
    }
    return false;
  }

  /**
   * Priority 5: Run registered custom interceptors (e.g. unsaved changes check)
   */
  handleCustomInterceptors() {
    for (const item of navigationService.customBackInterceptors) {
      try {
        const consumed = item.fn();
        if (consumed) return true;
      } catch (e) {
        console.error(`[BackHandler] Interceptor ${item.id} error:`, e);
      }
    }
    return false;
  }

  /**
   * Priority 6: Pop stack screen
   */
  handleStackBack() {
    return navigationService.pop();
  }

  /**
   * Priority 7: Switch from non-root tab (Live / Profile) back to Home tab
   */
  handleNonRootTabBack() {
    if (navigationService.currentTab !== 'home') {
      if (typeof document !== 'undefined') {
        const navHome = document.getElementById('nav-home');
        if (navHome) {
          navHome.click();
          return true;
        }
      }
      navigationService.setTab('home');
      return true;
    }
    return false;
  }


  /**
   * Priority 8: Double-back-to-exit on true root Home screen
   */
  handleRootBack(fromPopState) {
    const now = Date.now();
    const timeSinceLastPress = now - this.lastRootBackPressTime;

    if (timeSinceLastPress < this.doubleBackExitThresholdMs) {
      // Second back press within 2000ms: allow exit
      navigationService.logDebug('ROOT_BACK_EXIT', 'Exit application confirmed by double-back');
      this.hideExitToast();
      // On web/PWA, if in standalone mode or WebView, window.close() or let popstate pass
      if (typeof window !== 'undefined') {
        if (window.navigator && window.navigator.app && window.navigator.app.exitApp) {
          window.navigator.app.exitApp();
        }
      }
      return false; // Not consumed -> OS will handle exit
    }

    // First back press: Intercept and display exit toast warning
    this.lastRootBackPressTime = now;
    navigationService.logDebug('ROOT_BACK_FIRST', 'Showing "Press back again to exit" toast');

    this.showExitToast('Press back again to exit');

    // If triggered from popstate, push root state back to keep user in app
    if (fromPopState && typeof window !== 'undefined' && window.history) {
      try {
        window.history.pushState({ screen: 'root', tab: 'home', depth: 0 }, '', window.location.pathname);
      } catch (e) {
        console.warn('[BackHandler] pushState error during root trap:', e);
      }
    }

    return true; // Consumed
  }

  /**
   * Display floating toast: "Press back again to exit"
   */
  showExitToast(message) {
    if (typeof document === 'undefined') return;

    if (!this.toastElement) {
      this.toastElement = document.createElement('div');
      this.toastElement.className = 'nr-nav-toast';
      this.toastElement.id = 'nr-exit-toast';
      document.body.appendChild(this.toastElement);
    }

    this.toastElement.textContent = message;
    this.toastElement.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.hideExitToast();
    }, this.doubleBackExitThresholdMs);
  }

  /**
   * Hide the exit toast
   */
  hideExitToast() {
    if (this.toastElement) {
      this.toastElement.classList.remove('visible');
    }
  }
}

export const backHandler = new BackHandler();
