import "./instrument.js";
import { notificationClient } from "./notifications/notification-service.js";
import { submitSOSIncident } from "./sos-service.js";

// Automatically trigger system OS permission and OS notification popup on app entry
notificationClient.triggerSystemPromptOnAppEntry();

// Globally prevent unwanted interactions
window.addEventListener("contextmenu", (e) => {
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});

window.addEventListener("selectstart", (e) => {
  if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault();
  }
});

window.addEventListener("dragstart", (e) => {
  if (e.target.tagName === "IMG" || e.target.tagName === "A") {
    e.preventDefault();
  }
});

let map;
let userMarker;

async function initMap() {
  try {
    if (typeof google === 'undefined' || !google.maps || !google.maps.importLibrary) {
      console.warn('[Map] Google Maps SDK unavailable (offline).');
      return;
    }
    const { Map } = await google.maps.importLibrary("maps");

  // Center on San Francisco for a placeholder initially
  map = new Map(document.getElementById("map"), {
    center: { lat: 37.7749, lng: -122.4194 },
    zoom: 14,
    disableDefaultUI: true, // cleaner look for mobile
    zoomControl: false,
    gestureHandling: "greedy",
    // Add slight bottom padding to keep the marker at ~45% of the 50vh map height
    padding: { bottom: window.innerHeight * 0.05 },
    // Provide explicit styling array (do NOT use mapId to allow client-side styling)
    styles: [
      {
        // Hide all general points of interest (businesses, medical, schools, etc.)
        featureType: "poi",
        stylers: [{ visibility: "off" }]
      },
      {
        // Explicitly turn parks back on
        featureType: "poi.park",
        stylers: [{ visibility: "on" }]
      },
      {
        // Explicitly turn all transit (bus, metro, rail) back on
        featureType: "transit",
        stylers: [{ visibility: "on" }]
      }
      // Note: Water bodies and administrative (locality) labels stay visible by default
    ]
  });

  // Try HTML5 geolocation to get the user's live location.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Center the map on the user's location
        map.setCenter(pos);
        map.setZoom(16); // Zoom in closer for the live location

        // Add a legacy Marker with an SVG path for the blue dot (since AdvancedMarker requires mapId)
        userMarker = new google.maps.Marker({
          map: map,
          position: pos,
          title: "You are here",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "white",
            strokeWeight: 3
          }
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        handleLocationError(true, map.getCenter());
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  } else {
    // Browser doesn't support Geolocation
    handleLocationError(false, map.getCenter());
  }

  // Handle location button click
  const locationBtn = document.getElementById("my-location-btn");
  if (locationBtn) {
    locationBtn.addEventListener("click", () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            map.panTo(pos); // Smoothly recenter
            map.setZoom(16); // Reset zoom to default user location zoom
            if (userMarker) {
              userMarker.setPosition(pos); // Update marker position
            }
          },
          (error) => {
            console.error("Error getting location on button click:", error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      }
    });
  }
  } catch (mapErr) {
    console.warn('[Map] Google Maps failed to load offline:', mapErr);
  }
}

function handleLocationError(browserHasGeolocation, pos) {
  console.warn(
    browserHasGeolocation
      ? "Error: The Geolocation service failed. Ensure you have granted location permissions in your browser."
      : "Error: Your browser doesn't support geolocation."
  );
}

initMap();

// SOS Slider Logic
const sosSlider = document.getElementById('sos-slider');
const sosThumb = document.getElementById('sos-thumb');
const blueCard = document.getElementById('blue-card');
const restText = document.getElementById('rest-text');
const slideHintText = document.getElementById('slide-hint-text');

const defaultArrowSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;
const closeIconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>`;

let sliderTimeout;
let autoCloseTimeout;
let isCloseState = false;
let isSOSInProgress = false;

const resetSlider = () => {
  clearTimeout(sliderTimeout);
  clearTimeout(autoCloseTimeout);
  isSOSInProgress = false;

  const existingStatus = document.getElementById('sos-status-display');
  if (existingStatus) existingStatus.remove();

  if (sosThumb) {
    sosThumb.style.transform = `translateX(0px)`;
    sosThumb.style.display = 'none';
    sosThumb.classList.remove('hint-bounce', 'icon-pop');
  }
  if (slideHintText) slideHintText.style.display = 'none';
  if (restText) {
    restText.style.display = 'flex';
    restText.classList.remove('text-fade-in');
    void restText.offsetWidth; // Trigger reflow to restart animation
    restText.classList.add('text-fade-in');
  }
};

const renderSOSState = (state, incidentId = '', errorMsg = '') => {
  let statusDisplay = document.getElementById('sos-status-display');
  if (!statusDisplay) {
    statusDisplay = document.createElement('div');
    statusDisplay.id = 'sos-status-display';
    statusDisplay.style.cssText = 'display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; color: #ffffff; text-align: center; padding: 2px 6px; z-index: 5; pointer-events: auto;';
    sosSlider.appendChild(statusDisplay);
  }

  if (state === 'TRANSMITTING') {
    statusDisplay.onclick = null;
    statusDisplay.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; color:#ffffff;">
        <span style="display:inline-block; width:13px; height:13px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
        Transmitting SOS Alert...
      </div>
      <div style="font-size:11px; opacity:0.9; margin-top:2px;">Acquiring live GPS & user coordinates</div>
    `;
  } else if (state === 'SENT') {
    statusDisplay.onclick = null;
    statusDisplay.innerHTML = `
      <div style="font-weight: 800; font-size: 13px; letter-spacing: 0.3px; color: #FFFFFF; display: flex; align-items: center; gap: 5px;">
        <span style="font-size: 15px;">🚨</span> SOS Alert Sent
      </div>
      <div style="font-size: 11px; opacity: 0.95; margin-top: 1px; font-weight: 600;">
        Authority will reach you within 1 minute.
      </div>
      <div style="font-size: 10px; opacity: 0.85; font-family: monospace; margin-top: 2px;">
        ${incidentId}
      </div>
    `;
  } else if (state === 'ACKNOWLEDGED') {
    statusDisplay.onclick = null;
    statusDisplay.innerHTML = `
      <div style="font-weight: 800; font-size: 12.5px; letter-spacing: 0.3px; color: #FEF08A; display: flex; align-items: center; gap: 4px;">
        <span>⚠️</span> Emergency alert acknowledged by authority.
      </div>
      <div style="font-size: 11px; opacity: 0.95; margin-top: 1px; font-weight: 600;">
        Assistance is en route to your location.
      </div>
      <div style="font-size: 10px; opacity: 0.85; font-family: monospace; margin-top: 1px;">
        ${incidentId}
      </div>
    `;
  } else if (state === 'RESOLVED') {
    statusDisplay.onclick = null;
    statusDisplay.innerHTML = `
      <div style="font-weight: 800; font-size: 13px; letter-spacing: 0.3px; color: #86EFAC; display: flex; align-items: center; gap: 6px;">
        <span>✅</span> SOS incident resolved.
      </div>
      <div style="font-size: 11px; opacity: 0.95; margin-top: 1px;">
        Stay safe! Returning to home...
      </div>
    `;
  } else if (state === 'ERROR') {
    statusDisplay.innerHTML = `
      <div style="font-weight: 700; font-size: 12px; color: #FECACA; display: flex; align-items: center; gap: 4px;">
        <span>⚠️</span> ${errorMsg || 'Failed to trigger SOS alert.'}
      </div>
      <div style="font-size: 11px; text-decoration: underline; margin-top: 2px; font-weight: 700; cursor: pointer; color: #FFFFFF;">
        Tap to retry
      </div>
    `;
    statusDisplay.onclick = (e) => {
      e.stopPropagation();
      executeSOSSubmission();
    };
  }
};

const executeSOSSubmission = async () => {
  renderSOSState('TRANSMITTING');
  try {
    const result = await submitSOSIncident({
      onStatusChange: (update) => {
        if (update.status === 'ACKNOWLEDGED') {
          renderSOSState('ACKNOWLEDGED', update.incidentId);
        } else if (update.status === 'RESOLVED') {
          renderSOSState('RESOLVED', update.incidentId);
          setTimeout(() => {
            resetSlider();
          }, 4000);
        }
      },
      onError: (err) => {
        renderSOSState('ERROR', null, err.message);
      }
    });

    renderSOSState('SENT', result.incidentId);
  } catch (err) {
    console.error('[SOS] Submission error:', err);
    renderSOSState('ERROR', null, err.message);
  }
};

if (sosSlider && sosThumb) {
  let isDragging = false;
  let startX = 0;
  let maxTranslate = 0;

  const onDragStart = (e) => {
    if (isCloseState || isSOSInProgress) return;
    clearTimeout(sliderTimeout);
    clearTimeout(autoCloseTimeout);
    sosThumb.classList.remove('hint-bounce');
    isDragging = true;
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    maxTranslate = sosSlider.offsetWidth - sosThumb.offsetWidth - 8;
    sosThumb.style.transition = 'none';
  };

  const onDragMove = (e) => {
    if (!isDragging || isSOSInProgress) return;
    let currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    let translate = currentX - startX;

    if (translate < 0) translate = 0;
    if (translate > maxTranslate) translate = maxTranslate;

    sosThumb.style.transform = `translateX(${translate}px)`;
  };

  const onDragEnd = (e) => {
    if (!isDragging || isSOSInProgress) return;
    isDragging = false;
    sosThumb.style.transition = 'transform 0.3s ease';

    let currentX = e.type.includes('mouse') ? e.clientX : e.changedTouches[0].clientX;
    let translate = currentX - startX;

    if (translate > maxTranslate * 0.8) {
      isSOSInProgress = true;
      clearTimeout(sliderTimeout);
      clearTimeout(autoCloseTimeout);
      sosThumb.style.transform = `translateX(${maxTranslate}px)`;
      sosThumb.style.display = 'none';
      if (slideHintText) slideHintText.style.display = 'none';
      if (restText) restText.style.display = 'none';

      executeSOSSubmission();
    } else {
      sosThumb.style.transform = `translateX(0px)`;
      // Restart timeout if they let go without triggering
      clearTimeout(sliderTimeout);
      clearTimeout(autoCloseTimeout);
      sosThumb.classList.add('hint-bounce');
      sliderTimeout = setTimeout(() => {
        isCloseState = true;
        sosThumb.classList.remove('hint-bounce');
        sosThumb.innerHTML = closeIconSVG;
        sosThumb.classList.add('icon-pop');
        if (slideHintText) slideHintText.style.display = 'none';
        autoCloseTimeout = setTimeout(resetSlider, 500);
      }, 5000);
    }
  };

  sosThumb.addEventListener('mousedown', onDragStart);
  sosThumb.addEventListener('touchstart', onDragStart, { passive: true });

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, { passive: false });

  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchend', onDragEnd);

  sosThumb.addEventListener('click', () => {
    if (isCloseState) {
      resetSlider();
    }
  });
}

if (blueCard && sosThumb) {
  let tapCount = 0;
  let tapTimer;

  const handleTap = (e) => {
    if (e.target.closest('#sos-thumb') || isSOSInProgress || document.getElementById('sos-status-display')) return;

    tapCount++;
    clearTimeout(tapTimer);

    if (tapCount === 3) {
      isCloseState = false;
      sosThumb.classList.remove('icon-pop');
      sosThumb.innerHTML = defaultArrowSVG;
      sosThumb.style.transform = `translateX(0px)`;
      sosThumb.style.display = 'flex';
      sosThumb.classList.add('hint-bounce');

      if (slideHintText) {
        slideHintText.style.display = 'block';
        slideHintText.classList.remove('text-fade-in');
        void slideHintText.offsetWidth; // trigger reflow
        slideHintText.classList.add('text-fade-in');
      }

      if (restText) restText.style.display = 'none';
      tapCount = 0;

      clearTimeout(sliderTimeout);
      clearTimeout(autoCloseTimeout);
      sliderTimeout = setTimeout(() => {
        isCloseState = true;
        sosThumb.classList.remove('hint-bounce');
        sosThumb.innerHTML = closeIconSVG;
        sosThumb.classList.add('icon-pop');
        if (slideHintText) slideHintText.style.display = 'none';
        autoCloseTimeout = setTimeout(resetSlider, 500);
      }, 5000);
    } else {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 500);
    }
  };

  blueCard.addEventListener('click', handleTap);
}

