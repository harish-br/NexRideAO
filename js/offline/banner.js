/**
 * js/offline/banner.js
 * Renders and controls the top offline notification banner matching
 * the NexRide UI mockups exactly.
 */

import { connectivity } from './connectivity.js';

const WIFI_OFF_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="1" x2="23" y2="23"></line>
  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
  <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
  <line x1="12" y1="20" x2="12.01" y2="20"></line>
</svg>`;

const WIFI_ON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
  <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
  <line x1="12" y1="20" x2="12.01" y2="20"></line>
</svg>`;

const REFRESH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
</svg>`;

class OfflineBannerController {
  constructor() {
    this.bannerEl = null;
    this.textEl = null;
    this.iconEl = null;
    this.actionBtn = null;
    this.refreshIcon = null;
    this.hasBeenOffline = false;
    this.dismissTimer = null;
    this.cleanupTimer = null;
    this.isRefreshing = false;
    this.defaultThemeColor = null;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }
  }

  init() {
    if (this.bannerEl) return;
    this.captureDefaultThemeColor();
    this.createDOM();
    this.bindEvents();
  }

  captureDefaultThemeColor() {
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="theme-color"]');
      this.defaultThemeColor = meta ? (meta.getAttribute('content') || '#0044CC') : '#0044CC';
    }
  }

  setThemeColor(color) {
    if (typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', color);
    }
  }

  resetThemeColorToDefault() {
    this.setThemeColor(this.defaultThemeColor || '#0044CC');
  }

  createDOM() {
    let el = document.getElementById('nexride-offline-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nexride-offline-banner';
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'polite');
      el.style.display = 'none';

      el.innerHTML = `
        <div class="nr-banner-left">
          <div class="nr-banner-icon" id="nr-banner-icon"></div>
          <span class="nr-banner-text" id="nr-banner-text">No Internet Connection</span>
        </div>
        <button type="button" class="nr-banner-action-btn" id="nr-banner-action-btn">
          <span class="nr-banner-refresh-icon" id="nr-banner-refresh-icon">${REFRESH_SVG}</span>
          <span>Refresh</span>
        </button>
      `;

      document.body.prepend(el);
    }

    this.bannerEl = el;
    this.iconEl = el.querySelector('#nr-banner-icon');
    this.textEl = el.querySelector('#nr-banner-text');
    this.actionBtn = el.querySelector('#nr-banner-action-btn');
    this.refreshIcon = el.querySelector('#nr-banner-refresh-icon');
  }

  bindEvents() {
    if (this.actionBtn) {
      this.actionBtn.addEventListener('click', () => this.onRefreshClick());
    }

    // Subscribe to connectivity events
    connectivity.subscribe((state) => {
      this.handleStateChange(state);
    });
  }

  handleStateChange(state) {
    if (!this.bannerEl) this.init();

    if (!state.isServerReachable) {
      this.hasBeenOffline = true;
      clearTimeout(this.dismissTimer);
      clearTimeout(this.cleanupTimer);

      this.bannerEl.style.display = 'flex';
      void this.bannerEl.offsetHeight; // force reflow for smooth enter animation

      this.bannerEl.classList.remove('banner-online', 'banner-default');
      this.bannerEl.classList.add('banner-offline', 'visible');
      this.setThemeColor('#F6BE48');

      this.iconEl.innerHTML = WIFI_OFF_SVG;
      this.actionBtn.style.display = 'inline-flex';

      if (state.event === 'still_offline') {
        this.textEl.textContent = 'Still no internet connection';
      } else {
        this.textEl.textContent = 'No Internet Connection';
      }

      this.stopRefreshAnimation();
    } else {
      // Reconnected / Server is reachable
      this.stopRefreshAnimation();

      if (this.hasBeenOffline) {
        // Show the green "Back Online" banner
        this.bannerEl.style.display = 'flex';
        void this.bannerEl.offsetHeight;

        this.bannerEl.classList.remove('banner-offline', 'banner-default');
        this.bannerEl.classList.add('banner-online', 'visible');
        this.setThemeColor('#22C55E');

        this.iconEl.innerHTML = WIFI_ON_SVG;
        this.textEl.textContent = 'Back Online';
        this.actionBtn.style.display = 'none';

        // Auto-dismiss after 2.2 seconds: show default header color and slide up
        clearTimeout(this.dismissTimer);
        this.dismissTimer = setTimeout(() => {
          this.showDefaultHeaderAndDismiss();
        }, 2200);
      } else {
        // Initial online launch or normal online state: ensure header is at default
        this.resetHeaderToDefault();
      }
    }
  }

  showDefaultHeaderAndDismiss() {
    if (!this.bannerEl) return;

    // 1. Transition header color to default styling
    this.bannerEl.classList.remove('banner-online', 'banner-offline');
    this.bannerEl.classList.add('banner-default');
    this.resetThemeColorToDefault();

    // 2. Slide out of viewport
    this.bannerEl.classList.remove('visible');
    this.hasBeenOffline = false;

    // 3. Once the 350ms slide transition finishes, fully hide to avoid overscroll peek
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => {
      if (!this.bannerEl.classList.contains('visible')) {
        this.bannerEl.classList.remove('banner-default');
        this.bannerEl.style.display = 'none';
      }
    }, 400);
  }

  resetHeaderToDefault() {
    if (!this.bannerEl) return;
    clearTimeout(this.dismissTimer);
    clearTimeout(this.cleanupTimer);
    this.bannerEl.classList.remove('visible', 'banner-online', 'banner-offline', 'banner-default');
    this.bannerEl.style.display = 'none';
    this.hasBeenOffline = false;
    this.resetThemeColorToDefault();
  }

  async onRefreshClick() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    if (this.refreshIcon) {
      this.refreshIcon.classList.add('spinning');
    }

    try {
      await connectivity.checkReachability(true);
    } finally {
      this.stopRefreshAnimation();
    }
  }

  stopRefreshAnimation() {
    this.isRefreshing = false;
    if (this.refreshIcon) {
      this.refreshIcon.classList.remove('spinning');
    }
  }
}

export const offlineBanner = new OfflineBannerController();
