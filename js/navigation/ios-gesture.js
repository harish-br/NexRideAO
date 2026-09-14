/**
 * NexRide AO - iOS Interactive Swipe-Back Gesture Controller
 * 
 * Enables native-feeling left-edge interactive swipe-to-pop navigation for
 * stack screens and tabs on iOS / touch-enabled devices without interfering with
 * vertical scrolling or internal sliders.
 * 
 * Features:
 * - Generous 80px thumb edge zone (matching iOS Human Interface Guidelines)
 * - Support for both Touch Events and Pointer Events (desktop emulation, mouse, stylus)
 * - Intelligent target resolution: stack screens, non-root tabs (Profile/Live), DOM overlays
 * - Dual-axis angle detection prevents premature cancellation from thumb wobble
 * - Smooth 60fps GPU-accelerated translation with native iOS drop shadow
 * - Direct execution fallback to ensure navigation never stalls
 */

import { navigationService } from './navigation-service.js';

class IOSSwipeBackGesture {
  constructor() {
    this.startX = 0;
    this.startY = 0;
    this.currentDeltaX = 0;
    this.startTime = 0;
    this.isTracking = false;
    this.isHorizontalSwipe = false;
    this.isPointerActive = false;
    this.isTouchActive = false;
    this.activePointerId = null;

    // Generous edge zone: 80px allows comfortable natural thumb reach from left bezel
    this.edgeThresholdPx = 80;
    this.popDistanceThresholdPx = 85; // Distance to commit pop
    this.popVelocityThreshold = 0.35; // Velocity (px/ms) to commit pop

    this.activeTarget = null; // { element: HTMLElement, type: 'stack'|'tab'|'overlay', id: string }
    this.activeScreenElement = null;
    this.isListening = false;
  }

  init() {
    if (this.isListening) return;
    this.isListening = true;

    if (typeof document === 'undefined') return;

    // 1. Touch Events (mobile devices & iOS Safari)
    document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
    document.addEventListener('touchcancel', (e) => this.handleTouchCancel(e), { passive: true });

    // 2. Pointer Events (desktop DevTools simulation, mouse, trackpad, stylus)
    if (typeof window !== 'undefined' && window.PointerEvent) {
      document.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: true });
      document.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: false });
      document.addEventListener('pointerup', (e) => this.handlePointerUp(e), { passive: true });
      document.addEventListener('pointercancel', (e) => this.handlePointerCancel(e), { passive: true });
    }

    console.log('[IOSSwipeBack] Interactive swipe-back gesture initialized (Touch + Pointer supported)');
  }

  /**
   * Dynamically resolves the active screen, tab, or overlay that can be swiped back
   */
  findActiveTarget() {
    // 1. Never intercept if a modal or lightbox dialog is open
    if (navigationService.hasActiveModal()) {
      return null;
    }

    // 2. Stack screen managed by NavigationService
    const topScreen = navigationService.getTopScreen();
    if (topScreen) {
      const el = topScreen.element || (typeof document !== 'undefined' ? document.getElementById(topScreen.id) : null);
      if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
        return { element: el, type: 'stack', id: topScreen.id };
      }
    }

    // 3. Tab pages (Profile or Live) when on non-root tabs
    if (typeof document !== 'undefined') {
      if (navigationService.currentTab === 'profile') {
        const profileEl = document.getElementById('profile-page');
        if (profileEl && !profileEl.classList.contains('hidden')) {
          return { element: profileEl, type: 'tab', id: 'profile-page' };
        }
      }
      if (navigationService.currentTab === 'live') {
        const liveEl = document.getElementById('live-page');
        if (liveEl && !liveEl.classList.contains('hidden')) {
          return { element: liveEl, type: 'tab', id: 'live-page' };
        }
      }

      // 4. Fallback: Any visible page-overlay not hidden (excluding auth & home)
      const visibleOverlays = Array.from(document.querySelectorAll('.page-overlay:not(.hidden)'))
        .filter(el => el.id !== 'auth-page' && el.style.display !== 'none');
      if (visibleOverlays.length > 0) {
        const topEl = visibleOverlays[visibleOverlays.length - 1];
        return { element: topEl, type: 'overlay', id: topEl.id };
      }
    }

    return null;
  }

  // --- Touch Event Handlers ---

  handleTouchStart(e) {
    if (this.isPointerActive) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const target = this.findActiveTarget();
    if (!target) return;

    // Check edge threshold
    const maxEdge = Math.min(this.edgeThresholdPx, (typeof window !== 'undefined' ? window.innerWidth * 0.25 : 80) || 80);
    if (touch.clientX > maxEdge) return;

    this.isTouchActive = true;
    this.startTracking(touch.clientX, touch.clientY, target);
  }

  handleTouchMove(e) {
    if (!this.isTracking || !this.activeScreenElement) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    this.trackMove(touch.clientX, touch.clientY, e);
  }

  handleTouchEnd(e) {
    if (!this.isTracking) return;
    this.isTouchActive = false;
    this.endTracking();
  }

  handleTouchCancel(e) {
    this.isTouchActive = false;
    this.cancelTracking();
  }

  // --- Pointer Event Handlers ---

  handlePointerDown(e) {
    if (this.isTouchActive) return;
    if (e.isPrimary === false) return;
    // Only allow touch, pen, or primary mouse button
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = this.findActiveTarget();
    if (!target) return;

    const maxEdge = Math.min(this.edgeThresholdPx, (typeof window !== 'undefined' ? window.innerWidth * 0.25 : 80) || 80);
    if (e.clientX > maxEdge) return;

    this.isPointerActive = true;
    this.activePointerId = e.pointerId;
    this.startTracking(e.clientX, e.clientY, target);
  }

  handlePointerMove(e) {
    if (!this.isTracking || !this.activeScreenElement) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    this.trackMove(e.clientX, e.clientY, e);
  }

  handlePointerUp(e) {
    if (!this.isTracking) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    this.isPointerActive = false;
    this.activePointerId = null;
    this.endTracking();
  }

  handlePointerCancel(e) {
    this.isPointerActive = false;
    this.activePointerId = null;
    this.cancelTracking();
  }

  // --- Core Shared Gesture Logic ---

  startTracking(clientX, clientY, target) {
    this.startX = clientX;
    this.startY = clientY;
    this.currentDeltaX = 0;
    this.startTime = Date.now();
    this.isTracking = true;
    this.isHorizontalSwipe = false;
    this.activeTarget = target;
    this.activeScreenElement = target.element;
  }

  trackMove(clientX, clientY, event) {
    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;

    // Direction lock logic
    if (!this.isHorizontalSwipe) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Only cancel if vertical displacement clearly dominates and exceeds 20px
      if (absY > 20 && absY > absX * 1.5) {
        this.resetTracking();
        return;
      }

      // Lock horizontal swipe when user has moved right with clear horizontal direction
      if (deltaX > 8 && deltaX > absY) {
        this.isHorizontalSwipe = true;
      }
    }

    if (this.isHorizontalSwipe && deltaX >= 0) {
      if (event.cancelable) event.preventDefault();

      this.currentDeltaX = deltaX;
      this.activeScreenElement.style.transition = 'none';
      this.activeScreenElement.style.transform = `translate3d(${deltaX}px, 0, 0)`;
      this.activeScreenElement.style.boxShadow = '-4px 0 25px rgba(0, 0, 0, 0.18)';
      this.activeScreenElement.style.willChange = 'transform';
    }
  }

  endTracking() {
    if (!this.isTracking || !this.activeScreenElement) {
      this.resetTracking();
      return;
    }

    const elapsed = Math.max(1, Date.now() - this.startTime);
    const velocity = this.currentDeltaX / elapsed;
    const target = this.activeTarget;
    const el = this.activeScreenElement;

    if (this.currentDeltaX > this.popDistanceThresholdPx || velocity > this.popVelocityThreshold) {
      // Commit the pop transition: animate completely off-screen
      el.style.transition = 'transform 0.24s cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translate3d(100%, 0, 0)';

      setTimeout(() => {
        // Clean up styles
        if (el) {
          el.style.transform = '';
          el.style.transition = '';
          el.style.boxShadow = '';
          el.style.willChange = '';
        }

        if (target && target.type === 'tab') {
          // Switch tab back to home
          const navHome = document.getElementById('nav-home');
          if (navHome) {
            navHome.click();
          } else {
            navigationService.setTab('home');
          }
        } else {
          navigationService.goBack();
          // Fallback cleanup if overlay was not explicitly tracked in stack
          if (target && target.type === 'overlay' && el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
          }
        }
      }, 180);
    } else {
      // Cancel pop: snap back smoothly
      el.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translate3d(0px, 0, 0)';
      setTimeout(() => {
        if (el) {
          el.style.transform = '';
          el.style.transition = '';
          el.style.boxShadow = '';
          el.style.willChange = '';
        }
      }, 230);
    }

    this.resetTracking();
  }

  cancelTracking() {
    if (this.activeScreenElement) {
      const el = this.activeScreenElement;
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = 'translate3d(0px, 0, 0)';
      setTimeout(() => {
        if (el) {
          el.style.transform = '';
          el.style.transition = '';
          el.style.boxShadow = '';
          el.style.willChange = '';
        }
      }, 210);
    }
    this.resetTracking();
  }

  resetTracking() {
    this.isTracking = false;
    this.isHorizontalSwipe = false;
    this.activeTarget = null;
    this.activeScreenElement = null;
    this.currentDeltaX = 0;
  }
}

export const iosSwipeBackGesture = new IOSSwipeBackGesture();
