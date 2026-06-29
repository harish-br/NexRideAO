// Mock Database
const mockBusRoutes = [
  { routeNo: '580', source: 'Kallur', destination: 'Avadi BT', type: 'Town', status: 'Arriving' },
  { routeNo: '54E', source: 'MGR Koyambedu', destination: 'Meppur', type: 'Express', status: 'Running' },
  { routeNo: '12B', source: 'T.Nagar', destination: 'Anna Square', type: 'Local', status: 'Delayed' },
  { routeNo: '57A', source: 'Red Hills', destination: 'Vallalar Nagar', type: 'Town', status: 'Running' },
  { routeNo: '21G', source: 'Broadway', destination: 'Tambaram', type: 'Express', status: 'Arriving' }
];

const mockBusStops = [
  { stopId: '1', stopName: 'Dr Mgr Chennai Central – Return', address: 'Periamet, Jutkapuram', distance: '1.2 km away', routes: 4 },
  { stopId: '2', stopName: 'Airport Metro', address: 'Chennai International Airport', distance: '15.4 km away', routes: 2 },
  { stopId: '3', stopName: 'MGR Nagar', address: 'KK Nagar West', distance: '8.5 km away', routes: 5 },
  { stopId: '4', stopName: 'MGR Koyambedu', address: 'CMBT, Koyambedu', distance: '9.2 km away', routes: 12 },
  { stopId: '5', stopName: 'Anna Nagar Roundtana', address: 'Anna Nagar', distance: '6.1 km away', routes: 8 }
];

const mockRecentRoutes = ['580', '54E', '21G'];

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
    clearBtn.style.display = 'none';
    smartSuggestionsArea.style.display = 'block';
    searchResultsArea.style.display = 'none';
  }

  if (busSearchBtn) busSearchBtn.addEventListener('click', openModal);
  if (backBtn) backBtn.addEventListener('click', closeModal);

  // --- Location & Database Search ---
  
  // TODO: Connect database here
  // Fetches stops from database within a given radius
  async function fetchNearbyStopsFromDB(userLat, userLng, radiusKm = 5) {
    console.log(`Fetching stops within ${radiusKm}km of ${userLat}, ${userLng} from DB...`);
    // Example:
    // const response = await fetch(`/api/stops/nearby?lat=${userLat}&lng=${userLng}&radius=${radiusKm}`);
    // return await response.json();
    
    // Returning empty array for now since mock data should not be used
    return []; 
  }

  function updateLocationUI(title, subtitle) {
    userLocationText.innerHTML = `
      <span style="font-weight: 700; color: #4B5563; text-decoration: underline; text-underline-offset: 4px;">${title}</span>
      <span style="color: #9CA3AF; font-weight: 600; margin-left: 4px;">${subtitle}</span>
    `;
  }

  function detectLocation() {
    updateLocationUI("Detecting location", "...");
    nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Locating you...</div>';
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          updateLocationUI("Your Location", "(0km away)");
          const { latitude, longitude } = position.coords;
          
          try {
            nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Finding nearby stops...</div>';
            const nearbyStops = await fetchNearbyStopsFromDB(latitude, longitude);
            
            nearbyStopsContainer.innerHTML = '';
            if (nearbyStops && nearbyStops.length > 0) {
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
          nearbyStopsContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; text-align: center;">Location access denied. Cannot fetch nearby stops.</div>';
        }
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
      clearBtn.style.display = 'block';
    } else {
      clearBtn.style.display = 'none';
      smartSuggestionsArea.style.display = 'block';
      searchResultsArea.style.display = 'none';
      return;
    }

    // Hide suggestions, show skeleton
    smartSuggestionsArea.style.display = 'none';
    searchResultsArea.style.display = 'block';
    resultsList.innerHTML = '';
    emptyState.style.display = 'none';
    skeletonLoader.style.display = 'flex';

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      performSearch(val);
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    smartSuggestionsArea.style.display = 'block';
    searchResultsArea.style.display = 'none';
    searchInput.focus();
  });

  function performSearch(query) {
    skeletonLoader.style.display = 'none';
    resultsList.innerHTML = '';

    const isRouteSearch = /^[A-Za-z0-9]+$/.test(query) && /\d/.test(query);

    let results = [];
    if (isRouteSearch) {
      results = searchBusRoutes(query);
      if (results.length > 0) {
        results.slice(0, 10).forEach(route => {
          resultsList.appendChild(createRouteCard(route, query));
        });
      }
    } else {
      results = searchBusStops(query);
      if (results.length > 0) {
        results.slice(0, 10).forEach(stop => {
          resultsList.appendChild(createStopCard(stop, query));
        });
      }
    }

    if (results.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  function searchBusRoutes(query) {
    const q = query.toLowerCase();
    return mockBusRoutes.filter(route => route.routeNo.toLowerCase().includes(q));
  }

  function searchBusStops(query) {
    const q = query.toLowerCase();
    return mockBusStops.filter(stop => 
      stop.stopName.toLowerCase().includes(q) || stop.address.toLowerCase().includes(q)
    );
  }

  // --- Rendering Cards ---
  function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, `<span class="bs-highlight">$1</span>`);
  }

  function createRouteCard(route, highlightQuery = '') {
    const card = document.createElement('div');
    card.className = 'bs-card';
    
    // Status Badge Logic
    let statusClass = 'distance';
    if (route.status === 'Arriving') statusClass = 'arriving';
    if (route.status === 'Delayed') statusClass = 'express'; // reusing red bg

    // Route Type Badge Logic
    let typeClass = 'town';
    if (route.type === 'Express') typeClass = 'express';

    card.innerHTML = `
      <div class="bs-icon-box">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12a8 8 0 0 1 16 0z"></path>
          <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"></path>
          <path d="M8 20v2"></path>
          <path d="M16 20v2"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h.01"></path>
          <path d="M16 16h.01"></path>
        </svg>
      </div>
      <div class="bs-card-content">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
          <h4 class="bs-title" style="font-size: 20px;">${highlightText(route.routeNo, highlightQuery)}</h4>
          <span class="bs-badge ${typeClass}">${route.type}</span>
        </div>
        <p class="bs-subtitle">${highlightText(route.source, highlightQuery)} ↔ ${highlightText(route.destination, highlightQuery)}</p>
        <div style="margin-top: 6px;">
          <span class="bs-badge ${statusClass}">• ${route.status}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      // Trigger Haptic if available
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      alert(`Opening Route Details for: ${route.routeNo}`);
    });
    return card;
  }

  function createStopCard(stop, highlightQuery = '') {
    const card = document.createElement('div');
    card.className = 'bs-card';
    card.innerHTML = `
      <div class="bs-icon-box" style="background: #FEE2E2;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
      <div class="bs-card-content">
        <h4 class="bs-title">${highlightText(stop.stopName, highlightQuery)}</h4>
        <p class="bs-subtitle">${highlightText(stop.address, highlightQuery)}</p>
        <div style="margin-top: 6px; display: flex; gap: 8px;">
          <span class="bs-badge distance">${stop.distance}</span>
          <span class="bs-badge distance">${stop.routes} Routes</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => {
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      alert(`Opening Stop Details for: ${stop.stopName}`);
    });
    return card;
  }

  // --- Smart Suggestions ---
  
  // TODO: Connect database here for recent routes
  async function fetchRecentRoutesFromDB() {
    console.log(`Fetching recent routes from DB...`);
    // Example:
    // const response = await fetch(`/api/user/recent-routes`);
    // return await response.json();
    
    // Returning empty array for now since mock data should not be used
    return []; 
  }

  async function renderSmartSuggestions() {
    // nearbyStopsContainer is now handled dynamically in detectLocation
    recentRoutesContainer.innerHTML = '<div class="bs-subtitle" style="padding: 16px 0; font-size: 14px; text-align: center; width: 100%;">Loading recent routes...</div>';

    try {
      const recentRoutes = await fetchRecentRoutesFromDB();
      recentRoutesContainer.innerHTML = '';

      if (recentRoutes && recentRoutes.length > 0) {
        recentRoutes.forEach(routeNo => {
          const chip = document.createElement('div');
          chip.className = 'bs-recent-chip';
          chip.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${routeNo}
          `;
          chip.addEventListener('click', () => {
            searchInput.value = routeNo;
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
