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
}

function handleLocationError(browserHasGeolocation, pos) {
  console.warn(
    browserHasGeolocation
      ? "Error: The Geolocation service failed. Ensure you have granted location permissions in your browser."
      : "Error: Your browser doesn't support geolocation."
  );
}

initMap();
