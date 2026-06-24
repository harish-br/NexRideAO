document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('content-container');
  const handle = document.querySelector('.drag-handle-area');

  // Utility to calculate pixels from vh
  const vhToPx = (vh) => (vh * window.innerHeight) / 100;

  let snapPoints = {
    DEFAULT: -vhToPx(60), // Exactly bottom half
    FULL: -vhToPx(95) // Caps at 70vh so the 25vh marker remains visible above it
  };

  let currentY = snapPoints.DEFAULT;
  let startY = 0;
  let initialTranslateY = 0;
  let isDragging = false;
  let lastTimestamp = 0;
  let lastY = 0;
  let velocity = 0;

  const myLocationBtn = document.getElementById('my-location-btn');

  const updateLocationBtnVisibility = (yPos) => {
    if (!myLocationBtn) return;
    // Hide when dragged significantly upwards (e.g. past the middle point)
    const threshold = snapPoints.DEFAULT - 50; 
    if (yPos < threshold) {
      myLocationBtn.style.opacity = '0';
      myLocationBtn.style.pointerEvents = 'none';
    } else {
      myLocationBtn.style.opacity = '1';
      myLocationBtn.style.pointerEvents = 'auto';
    }
  };

  // Initialize state
  container.style.transform = `translateY(${currentY}px)`;
  updateLocationBtnVisibility(currentY);

  // Re-calculate points on window resize to remain perfectly responsive
  window.addEventListener('resize', () => {
    const oldDefault = snapPoints.DEFAULT;

    snapPoints = {
      DEFAULT: -vhToPx(50),
      FULL: -vhToPx(70)
    };

    // Proportionally adjust current position if it was resting at a snap point
    if (currentY === oldDefault) currentY = snapPoints.DEFAULT;
    snapToNearest();
  });

  const snapToNearest = () => {
    container.classList.add('animating'); // Enable spring transition

    // Calculate predicted resting position based on current velocity (throw physics)
    // velocity is px/ms. A quick flick might yield +/- 2 px/ms.
    const predictedY = currentY + (velocity * 150); // Predict where it goes in 150ms

    const distances = [
      { name: 'DEFAULT', val: snapPoints.DEFAULT },
      { name: 'FULL', val: snapPoints.FULL }
    ].map(point => ({
      name: point.name,
      val: point.val,
      dist: Math.abs(predictedY - point.val)
    }));

    // Find the closest snap point to our predicted location
    const nearest = distances.reduce((prev, curr) => prev.dist < curr.dist ? prev : curr);
    currentY = nearest.val;

    // Strict bounds locking just in case
    if (currentY > snapPoints.DEFAULT) {
      currentY = snapPoints.DEFAULT;
    }

    container.style.transform = `translateY(${currentY}px)`;
    updateLocationBtnVisibility(currentY);
  };

  const handlePointerDown = (e) => {
    isDragging = true;
    startY = e.clientY;
    initialTranslateY = currentY;
    lastY = e.clientY;
    lastTimestamp = performance.now();
    velocity = 0;

    // Disable transition during active drag for immediate 1-to-1 finger tracking
    container.classList.remove('animating');

    // Capture pointer events on the specific target so dragging outside works,
    // while keeping the target intact for potential click events on children.
    if (e.target.hasPointerCapture) {
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;

    // Calculate velocity for throw physics
    const now = performance.now();
    const dt = now - lastTimestamp;
    if (dt > 0) {
      velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastTimestamp = now;
    }

    const deltaY = e.clientY - startY;
    let newY = initialTranslateY + deltaY;

    // STRICT CONSTRAINT: Downward drag beyond the initial position is strictly locked
    // Larger negative values mean moving UP. Values > DEFAULT mean moving DOWN.
    if (newY > snapPoints.DEFAULT) {
      newY = snapPoints.DEFAULT; // Hard lock, no rubber-banding downwards
    }

    // Gentle rubber-banding at the very top (beyond FULL expansion)
    if (newY < snapPoints.FULL) {
      const overdrag = snapPoints.FULL - newY;
      newY = snapPoints.FULL - Math.pow(overdrag, 0.75); // Resist pulling past the roof
    }

    currentY = newY;
    container.style.transform = `translateY(${currentY}px)`;
    updateLocationBtnVisibility(currentY);
  };

  const handlePointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (e.target.hasPointerCapture) {
      e.target.releasePointerCapture(e.pointerId);
    }

    // Apply snap physics
    snapToNearest();
  };

  // Attach gesture listeners to the entire container
  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointermove', handlePointerMove);
  container.addEventListener('pointerup', handlePointerUp);
  container.addEventListener('pointercancel', handlePointerUp);

  // Navigation Bar Logic
  const navHome = document.getElementById('nav-home');
  const navLive = document.getElementById('nav-live');
  const navProfile = document.getElementById('nav-profile');
  const livePage = document.getElementById('live-page');
  const profilePage = document.getElementById('profile-page');
  const profileBackBtn = document.getElementById('profile-back-btn');
  
  // Personal Info overlay logic
  const btnPersonalInfo = document.getElementById('btn-personal-info');
  const personalInfoPage = document.getElementById('personal-info-page');
  const piBackBtn = document.getElementById('pi-back-btn');

  if (btnPersonalInfo && personalInfoPage && piBackBtn) {
    btnPersonalInfo.addEventListener('pointerdown', () => {
      personalInfoPage.classList.remove('hidden');
    });

    piBackBtn.addEventListener('pointerdown', () => {
      personalInfoPage.classList.add('hidden');
    });
  }

  // About Us overlay logic
  const btnAboutUs = document.getElementById('about-us-btn');
  const aboutUsPage = document.getElementById('about-us-page');
  const aboutUsBackBtn = document.getElementById('back-about-us');

  if (btnAboutUs && aboutUsPage && aboutUsBackBtn) {
    btnAboutUs.addEventListener('pointerdown', () => {
      aboutUsPage.classList.remove('hidden');
    });

    aboutUsBackBtn.addEventListener('pointerdown', () => {
      aboutUsPage.classList.add('hidden');
    });
  }

  // Terms overlay logic
  const btnTerms = document.getElementById('terms-btn');
  const termsPage = document.getElementById('terms-page');
  const termsBackBtn = document.getElementById('back-terms');

  if (btnTerms && termsPage && termsBackBtn) {
    btnTerms.addEventListener('pointerdown', () => {
      termsPage.classList.remove('hidden');
    });

    termsBackBtn.addEventListener('pointerdown', () => {
      termsPage.classList.add('hidden');
    });
  }

  // Privacy overlay logic
  const btnPrivacy = document.getElementById('privacy-btn');
  const privacyPage = document.getElementById('privacy-page');
  const privacyBackBtn = document.getElementById('back-privacy');

  if (btnPrivacy && privacyPage && privacyBackBtn) {
    btnPrivacy.addEventListener('pointerdown', () => {
      privacyPage.classList.remove('hidden');
    });

    privacyBackBtn.addEventListener('pointerdown', () => {
      privacyPage.classList.add('hidden');
    });
  }

  if (navHome && navLive && navProfile && livePage && profilePage) {
    const goHome = () => {
      navHome.classList.add('active');
      navLive.classList.remove('active');
      navProfile.classList.remove('active');
      livePage.classList.add('hidden');
      profilePage.classList.add('hidden');
    };

    navHome.addEventListener('pointerdown', goHome);
    
    if (profileBackBtn) profileBackBtn.addEventListener('pointerdown', goHome);

    navLive.addEventListener('pointerdown', () => {
      navLive.classList.add('active');
      navHome.classList.remove('active');
      navProfile.classList.remove('active');
      livePage.classList.remove('hidden');
      profilePage.classList.add('hidden');
    });

    navProfile.addEventListener('pointerdown', () => {
      navProfile.classList.add('active');
      navHome.classList.remove('active');
      navLive.classList.remove('active');
      profilePage.classList.remove('hidden');
      livePage.classList.add('hidden');
    });
  }
});
