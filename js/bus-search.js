import { firestore as db } from './firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const busSearchBtn = document.getElementById('bus-search-btn');
  const busSearchPage = document.getElementById('bus-search-page');
  const backBtn = document.getElementById('back-bus-search');

  const searchInput = document.getElementById('bs-search-input');
  const clearBtn = document.getElementById('bs-clear-btn');
  const userLocationText = document.getElementById('bs-user-location');

  const smartSuggestionsArea = document.getElementById('bs-smart-suggestions');
  const searchResultsArea = document.getElementById('bs-search-results');
  const resultsList = document.getElementById('bs-results-list');
  const emptyState = document.getElementById('bs-empty-state');
  const skeletonLoader = document.getElementById('bs-skeleton');

  const nearbyStopsContainer = document.getElementById('bs-nearby-stops');
  const recentRoutesContainer = document.getElementById('bs-recent-routes');

  // --- Modal Toggle ---
  function openModal() {
    busSearchPage.classList.remove('hidden');
    renderSmartSuggestions();
    detectLocation();
  }

  function closeModal() {
    busSearchPage.classList.add('hidden');
    searchInput.value = '';
    
    clearBtn.classList.add('hidden');
    clearBtn.style.display = 'none';
    
    smartSuggestionsArea.classList.remove('hidden');
    smartSuggestionsArea.style.display = 'block';
    
    searchResultsArea.classList.add('hidden');
    searchResultsArea.style.display = 'none';
    
    resultsList.innerHTML = '';
    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';
    skeletonLoader.classList.add('hidden');
    skeletonLoader.style.display = 'none';
  }

  if (busSearchBtn) busSearchBtn.addEventListener('click', openModal);
  if (backBtn) backBtn.addEventListener('click', closeModal);

  // --- Location & Database Search ---

  // Distance calculation (Haversine formula)
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  // Fetches stops from database within a given radius
  async function fetchNearbyStopsFromDB(userLat, userLng, radiusKm = 5) {
    console.log(`Fetching stops within ${radiusKm}km of ${userLat}, ${userLng} from DB...`);
    const stopsMap = new Map();

    try {
      const busesSnapshot = await getDocs(collection(db, 'buses'));
      busesSnapshot.forEach(doc => {
        const busData = doc.data();
        if (busData.stops && Array.isArray(busData.stops)) {
          busData.stops.forEach(stop => {
            if (stop.latitude && stop.longitude) {
              const stopName = stop.stopName || stop.name;
              if (!stopName) return;

              const dist = calculateDistance(userLat, userLng, parseFloat(stop.latitude), parseFloat(stop.longitude));
              if (stopsMap.has(stopName)) {
                const existing = stopsMap.get(stopName);
                const bNum = busData.bus_no || busData.busNumber;
                if (bNum) {
                  const bNumStr = String(bNum).trim();
                  if (!existing.busNumbers.includes(bNumStr)) {
                    existing.busNumbers.push(bNumStr);
                  }
                }
              } else {
                const bNum = busData.bus_no || busData.busNumber;
                const bNumStr = bNum ? String(bNum).trim() : null;
                stopsMap.set(stopName, {
                  stopId: stopName,
                  stopName: stopName,
                  distance: dist.toFixed(1) + ' km away',
                  rawDistance: dist,
                  busNumbers: bNumStr ? [bNumStr] : []
                });
              }
            }
          });
        }
      });

      const nearbyStops = Array.from(stopsMap.values());
      // Sort by distance
      nearbyStops.sort((a, b) => a.rawDistance - b.rawDistance);
      
      if (nearbyStops.length === 0) {
         nearbyStopsContainer.innerHTML = `<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">No stops found nearby. (Debug: ${busesSnapshot.size} documents found in database)</div>`;
         return [];
      }
      
      // Return top 5 closest stops
      return nearbyStops.slice(0, 5);
    } catch (error) {
      console.error("Error fetching buses for nearby stops:", error);
      nearbyStopsContainer.innerHTML = `<div class="bs-subtitle" style="padding: 16px 0; color: #EF4444; text-align: center;">Database Error: ${error.message}</div>`;
      return [];
    }
  }

  function updateLocationUI(title, subtitle) {
    userLocationText.innerHTML = `
      <span style="font-weight: 700; color: #4B5563; text-decoration: underline; text-underline-offset: 4px;">${title}</span>
      <span style="color: #9CA3AF; font-weight: 600; margin-left: 4px;">${subtitle}</span>
    `;
  }

  function detectLocation() {
    updateLocationUI("Detecting location", "");
    nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Locating you</div>';

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          updateLocationUI("Your Location", "(0km away)");
          const { latitude, longitude } = position.coords;

          try {
            nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Finding nearby stops</div>';
            const nearbyStops = await fetchNearbyStopsFromDB(latitude, longitude);

            nearbyStopsContainer.innerHTML = '';
            if (nearbyStops && nearbyStops.length > 0) {
              const nearest = nearbyStops[0];
              updateLocationUI(`Your Location`, `(${nearest.distance})`);

              nearbyStops.forEach(stop => {
                nearbyStopsContainer.appendChild(createStopCard(stop));
              });
            } else {
              nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">No stops found nearby.</div>';
            }
          } catch (error) {
            console.error("Error fetching nearby stops:", error);
            nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; color: #EF4444; text-align: center;">Failed to load nearby stops.</div>';
          }
        },
        (error) => {
          updateLocationUI("Erode Bus Stand", "(Default)");
          nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Location access denied or timed out. Cannot fetch nearby stops.</div>';
        },
        { timeout: 5000 }
      );
    } else {
      updateLocationUI("Erode Bus Stand", "(Default)");
      nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Geolocation not supported.</div>';
    }
  }

  // --- Search Logic ---
  let debounceTimeout;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) {
      clearBtn.classList.remove('hidden');
      clearBtn.style.display = 'block';
    } else {
      clearBtn.classList.add('hidden');
      clearBtn.style.display = 'none';
      smartSuggestionsArea.classList.remove('hidden');
      smartSuggestionsArea.style.display = 'block';
      searchResultsArea.classList.add('hidden');
      searchResultsArea.style.display = 'none';
      clearTimeout(debounceTimeout);
      return;
    }

    // Hide suggestions, show skeleton
    smartSuggestionsArea.classList.add('hidden');
    smartSuggestionsArea.style.display = 'none';
    searchResultsArea.classList.remove('hidden');
    searchResultsArea.style.display = 'block';
    resultsList.innerHTML = '';
    emptyState.classList.add('hidden');
    emptyState.style.display = 'none';
    skeletonLoader.classList.remove('hidden');
    skeletonLoader.style.display = 'flex';

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      performSearch(val);
    }, 50);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    clearBtn.style.display = 'none';
    smartSuggestionsArea.classList.remove('hidden');
    smartSuggestionsArea.style.display = 'block';
    searchResultsArea.classList.add('hidden');
    searchResultsArea.style.display = 'none';
    searchInput.focus();
  });

  async function performSearch(query) {
    resultsList.innerHTML = '';
    const q = query.toLowerCase();

    try {
      const busesSnapshot = await getDocs(collection(db, 'buses'));
      const routeResults = [];
      const stopResults = [];

      busesSnapshot.forEach(doc => {
        const busData = doc.data();
        const bNum = busData.bus_no || busData.busNumber;
        const bNumStr = bNum ? String(bNum).trim() : null;

        // Check if route matches
        if (bNumStr && bNumStr.toLowerCase().includes(q)) {
          if (!routeResults.some(r => r.routeNo === bNumStr)) {
            routeResults.push({
              routeNo: bNumStr,
              source: busData.route || busData.source || 'Unknown Route',
              destination: busData.destination || '',
              type: busData.type || 'Town',
              status: busData.status || (busData.isActive ? 'Active' : 'Offline'),
              eta: '',
              stops: busData.stops || []
            });
          }
        }

        // Check if stops match
        if (busData.stops && Array.isArray(busData.stops)) {
          busData.stops.forEach(stop => {
            let stopName = stop.stopName || stop.name;
            if (!stopName) return;
            stopName = String(stopName).trim(); // Remove trailing spaces

            if (stopName.toLowerCase().includes(q)) {
              // Avoid duplicates (case-insensitive)
              const existing = stopResults.find(s => s.stopName.toLowerCase() === stopName.toLowerCase());
              if (!existing) {
                stopResults.push({
                  stopId: stopName,
                  stopName: stopName,
                  distance: '',
                  busNumbers: bNumStr ? [bNumStr] : []
                });
              } else {
                if (bNumStr && !existing.busNumbers.includes(bNumStr)) {
                  existing.busNumbers.push(bNumStr);
                }
              }
            }
          });
        }
      });

      skeletonLoader.classList.add('hidden');
      skeletonLoader.style.display = 'none';

      if (routeResults.length > 0) {
        // Sort exact matches first for routes
        routeResults.sort((a, b) => {
          const aExact = a.routeNo.toLowerCase() === q ? 1 : 0;
          const bExact = b.routeNo.toLowerCase() === q ? 1 : 0;
          return bExact - aExact;
        });
        routeResults.slice(0, 10).forEach(route => {
          resultsList.appendChild(createRouteCard(route, query));
        });
      }

      if (stopResults.length > 0) {
        // Sort exact matches first for stops
        stopResults.sort((a, b) => {
          const aExact = a.stopName.toLowerCase() === q ? 1 : 0;
          const bExact = b.stopName.toLowerCase() === q ? 1 : 0;
          return bExact - aExact;
        });
        stopResults.slice(0, 10).forEach(stop => {
          resultsList.appendChild(createStopCard(stop, query));
        });
      }

      if (routeResults.length === 0 && stopResults.length === 0) {
        emptyState.innerHTML = `
          <div style="padding: 16px; margin-top: 24px; text-align: center;">
            <h3 style="color: #111827; font-weight: 600; margin-bottom: 8px; font-size: 16px;">No results found</h3>
            <p style="color: #6B7280; font-size: 14px;">Try searching for a different route number or bus stop name.</p>
          </div>
        `;
        emptyState.classList.remove('hidden');
        emptyState.style.display = 'block';
      } else {
        emptyState.classList.add('hidden');
        emptyState.style.display = 'none';
      }
    } catch (error) {
      console.error("Search Error:", error);
      skeletonLoader.classList.add('hidden');
      skeletonLoader.style.display = 'none';
      emptyState.innerHTML = `
        <div style="background: #FEE2E2; padding: 16px; border-radius: 12px; margin-top: 24px; text-align: center;">
          <h3 style="color: #991B1B; font-weight: 700; margin-bottom: 4px; font-size: 15px;">Search Failed</h3>
          <p style="color: #B91C1C; font-size: 13px;">${error.message}</p>
        </div>
      `;
      emptyState.classList.remove('hidden');
      emptyState.style.display = 'block';
    }
  }

  // Cache logic removed, querying DB directly in performSearch

  // --- Rendering Cards ---
  function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, `<span class="bs-highlight">$1</span>`);
  }

  function createRouteCard(route, highlightQuery = '') {
    const card = document.createElement('div');
    card.className = 'bs-card';
    card.style.padding = '10px 16px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';

    // Status Badge Logic
    let statusClass = 'distance';
    if (route.status === 'Arriving') statusClass = 'arriving';
    if (route.status === 'Delayed') statusClass = 'express'; // reusing red bg

    // Route Type Badge Logic
    let typeClass = 'town';
    if (route.type === 'Express') typeClass = 'express';

    card.innerHTML = `
      <div style="display: flex; gap: 16px; width: 100%; align-items: center;">
        <div class="bs-icon-box" style="background: #3B82F6; width: 40px; height: 40px; border-radius: 12px; display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
          <svg width="24" height="24" viewBox="0 0 1024 1024" fill="#FFFFFF" stroke="none">
            <path d="M881.777778 284.444444V199.111111c0-56.888889-59.733333-113.777778-369.777778-113.777778S142.222222 142.222222 142.222222 199.111111v85.333333c-31.288889 0-56.888889 25.6-56.888889 56.888889v56.888889c0 31.288889 25.6 56.888889 56.888889 56.888889v312.888889c0 31.288889 17.066667 59.733333 42.666667 73.955556v54.044444C184.888889 935.822222 216.177778 967.111111 256 967.111111s71.111111-31.288889 71.111111-71.111111V853.333333h369.777778v42.666667c0 39.822222 31.288889 71.111111 71.111111 71.111111s71.111111-31.288889 71.111111-71.111111v-54.044444c25.6-14.222222 42.666667-42.666667 42.666667-73.955556V455.111111c31.288889 0 56.888889-25.6 56.888889-56.888889v-56.888889c0-31.288889-25.6-56.888889-56.888889-56.888889zM312.888889 170.666667h398.222222c17.066667 0 28.444444 11.377778 28.444445 28.444444s-11.377778 28.444444-28.444445 28.444445H312.888889c-17.066667 0-28.444444-11.377778-28.444445-28.444445s11.377778-28.444444 28.444445-28.444444zM256 796.444444c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m512 0c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m56.888889-284.444444c0 45.511111-36.977778 85.333333-85.333333 85.333333H284.444444c-48.355556 0-85.333333-39.822222-85.333333-85.333333v-142.222222c0-48.355556 36.977778-85.333333 85.333333-85.333334h455.111112c48.355556 0 85.333333 36.977778 85.333333 85.333334v142.222222z" />
          </svg>
        </div>
        <div class="bs-card-content">
          <h4 class="bs-title">${highlightText(route.source, highlightQuery)}${route.destination ? ' ↔ ' + highlightText(route.destination, highlightQuery) : ''}</h4>
          <div style="margin-top: 4px; display: flex; gap: 8px; align-items: center; color: #6B7280; font-size: 13px; font-weight: 600;">
            <span>Bus: <span style="font-weight: 700; color: #111827;">${highlightText(route.routeNo, highlightQuery)}</span></span>
          </div>
        </div>
        <svg class="route-dropdown-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s; margin-left: auto; flex-shrink: 0;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="bs-route-stops-dropdown hidden" style="display: none; width: 100%; margin-top: 16px; border-top: 1px solid #F3F4F6; padding-top: 8px;">
        <div class="stops-list" style="display: flex; flex-direction: column;"></div>
      </div>
    `;

    const dropdown = card.querySelector('.bs-route-stops-dropdown');
    const stopsList = dropdown.querySelector('.stops-list');
    const arrow = card.querySelector('.route-dropdown-arrow');

    if (route.stops && route.stops.length > 0) {
      route.stops.forEach((stop, index) => {
        const isLast = index === route.stops.length - 1;
        const stopItem = document.createElement('div');
        stopItem.style.display = 'flex';
        stopItem.style.alignItems = 'stretch';

        stopItem.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; width: 40px; flex-shrink: 0;">
            <div style="width: 8px; flex: 1; background: ${index === 0 ? 'transparent' : '#F8FAFC'}; max-height: 24px;"></div>
            <div style="width: 10px; height: 10px; border-radius: 50%; background: #CBD5E1; flex-shrink: 0; position: relative; z-index: 1;"></div>
            <div style="width: 8px; flex: 1; background: ${isLast ? 'transparent' : '#F8FAFC'}; min-height: 24px;"></div>
          </div>
          <div style="flex: 1; padding: 16px 0; ${!isLast ? 'border-bottom: 1px solid #F3F4F6;' : ''}">
            <div style="font-size: 14px; font-weight: 600; color: #111827;">${stop.stopName || stop.name || 'Unknown Stop'}</div>
            ${stop.arrivalTime ? `<div style="font-size: 12px; color: #9CA3AF; margin-top: 4px; font-weight: 500;">ETA: ${stop.arrivalTime}</div>` : ''}
          </div>
        `;
        stopsList.appendChild(stopItem);
      });
    } else {
      stopsList.innerHTML = '<div style="font-size: 13px; color: #9CA3AF; padding: 16px 0; text-align: center;">No stops information available.</div>';
    }

    card.addEventListener('click', () => {
      // Trigger Haptic if available
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }

      if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        dropdown.style.display = 'block';
        card.style.background = '#F8FAFC';
        arrow.style.transform = 'rotate(180deg)';
        if (typeof saveRecentRoute === 'function') {
          saveRecentRoute(route);
        }
      } else {
        dropdown.classList.add('hidden');
        dropdown.style.display = 'none';
        card.style.background = '#FFFFFF';
        arrow.style.transform = 'rotate(0deg)';
      }
    });

    return card;
  }

  function createStopCard(stop, highlightQuery = '') {
    const card = document.createElement('div');
    card.className = 'bs-card';
    card.style.padding = '10px 16px'; // Lower the card height
    const busNumsText = stop.busNumbers && stop.busNumbers.length > 0 ? stop.busNumbers.join(', ') : 'N/A';

    card.innerHTML = `
      <div class="bs-icon-box" style="background: #3B82F6; width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- Shelter (L line) -->
          <polyline points="5 5 19 5 19 20"></polyline>
          <!-- Bus body from inline SVG -->
          <svg x="4" y="8" width="13" height="13" viewBox="0 0 1024 1024" fill="#FFFFFF" stroke="none">
            <path d="M881.777778 284.444444V199.111111c0-56.888889-59.733333-113.777778-369.777778-113.777778S142.222222 142.222222 142.222222 199.111111v85.333333c-31.288889 0-56.888889 25.6-56.888889 56.888889v56.888889c0 31.288889 25.6 56.888889 56.888889 56.888889v312.888889c0 31.288889 17.066667 59.733333 42.666667 73.955556v54.044444C184.888889 935.822222 216.177778 967.111111 256 967.111111s71.111111-31.288889 71.111111-71.111111V853.333333h369.777778v42.666667c0 39.822222 31.288889 71.111111 71.111111 71.111111s71.111111-31.288889 71.111111-71.111111v-54.044444c25.6-14.222222 42.666667-42.666667 42.666667-73.955556V455.111111c31.288889 0 56.888889-25.6 56.888889-56.888889v-56.888889c0-31.288889-25.6-56.888889-56.888889-56.888889zM312.888889 170.666667h398.222222c17.066667 0 28.444444 11.377778 28.444445 28.444444s-11.377778 28.444444-28.444445 28.444445H312.888889c-17.066667 0-28.444444-11.377778-28.444445-28.444445s11.377778-28.444444 28.444445-28.444444zM256 796.444444c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m512 0c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m56.888889-284.444444c0 45.511111-36.977778 85.333333-85.333333 85.333333H284.444444c-48.355556 0-85.333333-39.822222-85.333333-85.333333v-142.222222c0-48.355556 36.977778-85.333333 85.333333-85.333334h455.111112c48.355556 0 85.333333 36.977778 85.333333 85.333334v142.222222z" />
          </svg>
        </svg>
      </div>
      <div class="bs-card-content">
        <h4 class="bs-title">${highlightText(stop.stopName, highlightQuery)}</h4>
        <div style="margin-top: 4px; display: flex; gap: 8px; align-items: center; color: #6B7280; font-size: 13px; font-weight: 600;">
          <span>${(stop.distance || '').replace(/([\d.]+)/, '<span style="font-weight: 700; color: #111827;">$1</span>')}</span>
          <span>Bus: <span style="font-weight: 700; color: #111827;">${highlightText(busNumsText, highlightQuery)}</span></span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      console.log(`Stop selected: ${stop.stopName}`);
      if (typeof saveRecentRoute === 'function') {
        saveRecentRoute({ source: stop.stopName, destination: '', routeNo: '' });
      }
      // Future feature: handle stop tap without closing modal
    });
    return card;
  }

  // --- Smart Suggestions ---

  function fetchRecentRoutesFromStorage() {
    try {
      const stored = localStorage.getItem('nexride_recent_routes');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecentRoute(routeData) {
    try {
      let recents = fetchRecentRoutesFromStorage();
      const existingIdx = recents.findIndex(r => r.source === routeData.source && r.destination === routeData.destination && r.routeNo === routeData.routeNo);
      if (existingIdx !== -1) {
        recents.splice(existingIdx, 1);
      }
      recents.unshift({
        source: routeData.source,
        destination: routeData.destination,
        routeNo: routeData.routeNo
      });
      if (recents.length > 4) {
        recents = recents.slice(0, 4);
      }
      localStorage.setItem('nexride_recent_routes', JSON.stringify(recents));
    } catch (e) {
      console.error("Error saving recent route:", e);
    }
  }

  async function renderSmartSuggestions() {
    // nearbyStopsContainer is now handled dynamically in detectLocation
    recentRoutesContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; font-size: 14px; text-align: center; width: 100%;">Loading recent routes</div>';

    try {
      const recentRoutes = fetchRecentRoutesFromStorage();
      recentRoutesContainer.innerHTML = '';

      if (recentRoutes && recentRoutes.length > 0) {
        recentRoutes.forEach(route => {
          const chip = document.createElement('div');
          chip.className = 'bs-recent-chip';
          const displayText = route.destination ? `${route.source} &rarr; ${route.destination}` : route.source;
          chip.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${displayText}
          `;
          chip.addEventListener('click', () => {
            searchInput.value = route.routeNo || route.source;
            searchInput.dispatchEvent(new Event('input'));
          });
          recentRoutesContainer.appendChild(chip);
        });
      } else {
        recentRoutesContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; font-size: 14px; text-align: center; width: 100%;">No recent routes found.</div>';
      }
    } catch (error) {
      console.error("Error fetching recent routes:", error);
      recentRoutesContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; font-size: 14px; color: #EF4444; text-align: center; width: 100%;">Failed to load recent routes.</div>';
    }
  }

});
