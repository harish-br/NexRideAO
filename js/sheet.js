import { db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

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

  
  
  
  
  // Trusted Contacts Add/Delete functionality
  const addContactBtn = document.getElementById('add-contact-btn');
  const contactList = document.getElementById('contact-list');
  let currentContacts = [];

  const renderContacts = () => {
    if (!contactList) return;
    contactList.innerHTML = '';
    
    currentContacts.forEach(contact => {
      const initial = contact.name.charAt(0).toUpperCase();
      const card = document.createElement('div');
      card.className = 'tc-card';
      card.style.cssText = 'background: #FFFFFF; border-radius: 16px; padding: 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04);';
      
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #3B82F6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px;">
            ${initial}
          </div>
          <div>
            <div style="font-weight: 600; color: #111827; font-size: 16px; margin-bottom: 4px;">${contact.name}</div>
            <div style="color: #9CA3AF; font-size: 14px; font-weight: normal !important;">${contact.phone}</div>
          </div>
        </div>
        <button class="tc-delete-btn" data-id="${contact.id}" style="background: #F3F4F6; border: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      `;
      contactList.appendChild(card);
    });

    bindDeleteButtons();
  };

  const loadTrustedContacts = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.trustedContacts) {
            currentContacts = data.trustedContacts;
          }
        }
      } catch (error) {
        console.error("Error loading trusted contacts:", error);
      }
    } else {
      // Load from local storage for dev mode
      const local = localStorage.getItem('trustedContacts');
      if (local) currentContacts = JSON.parse(local);
    }
    renderContacts();
  };

  if (addContactBtn && contactList) {
    addContactBtn.addEventListener('pointerdown', () => {
      const addContactPage = document.getElementById('add-contact-page');
      if(addContactPage) {
        addContactPage.classList.remove('hidden');
        document.getElementById('new-contact-name').focus();
      }
    });

    const addContactPage = document.getElementById('add-contact-page');
    const backAddContactBtn = document.getElementById('back-add-contact');
    const newContactName = document.getElementById('new-contact-name');
    const newContactPhone = document.getElementById('new-contact-phone');
    const saveNewContactBtn = document.getElementById('save-new-contact-btn');

    if(addContactPage && backAddContactBtn && newContactName && newContactPhone && saveNewContactBtn) {
      
      const closeAddContactPage = () => {
        addContactPage.classList.add('hidden');
        newContactName.value = '';
        newContactPhone.value = '';
        validateForm();
      };

      backAddContactBtn.addEventListener('pointerdown', closeAddContactPage);

      const validateForm = () => {
        const nameValid = newContactName.value.trim().length > 0;
        let phoneVal = newContactPhone.value.replace(/\D/g, '');
        if (phoneVal.length > 10) phoneVal = phoneVal.slice(0, 10);
        newContactPhone.value = phoneVal;
        const phoneValid = phoneVal.length === 10;
        
        if(nameValid && phoneValid) {
          saveNewContactBtn.setAttribute('data-disabled', 'false');
          saveNewContactBtn.style.opacity = '1';
        } else {
          saveNewContactBtn.setAttribute('data-disabled', 'true');
          saveNewContactBtn.style.opacity = '0.5';
        }
      };

      ['input', 'change'].forEach(evt => {
        newContactName.addEventListener(evt, validateForm);
        newContactPhone.addEventListener(evt, validateForm);
      });

      saveNewContactBtn.addEventListener('pointerdown', async () => {
        if(saveNewContactBtn.getAttribute('data-disabled') === 'true') return;
        
        saveNewContactBtn.setAttribute('data-disabled', 'true');
        
        // Show loading spinner
        const originalText = saveNewContactBtn.innerHTML;
        saveNewContactBtn.innerHTML = `
          <svg style="animation: spin 1s linear infinite; height: 20px; width: 20px; margin-right: 8px; display: inline-block; vertical-align: middle;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity: 0.25;"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Saving...
        `;
        
        const name = newContactName.value.trim();
        const phone = newContactPhone.value;
        const newContact = {
          id: Date.now().toString(),
          name,
          phone
        };

        currentContacts.push(newContact);
        renderContacts();

        const user = auth.currentUser;
        try {
          if (user) {
            await setDoc(doc(db, 'users', user.uid), {
              trustedContacts: arrayUnion(newContact)
            }, { merge: true });
          } else {
            localStorage.setItem('trustedContacts', JSON.stringify(currentContacts));
          }
        } catch (err) {
          console.error("Sync error in save logic:", err);
          alert("Error: " + err.message);
        }

        saveNewContactBtn.innerHTML = originalText;
        closeAddContactPage();
      });
    }

    function bindDeleteButtons() {
      const deleteBtns = document.querySelectorAll('.tc-delete-btn');
      deleteBtns.forEach(btn => {
        btn.addEventListener('pointerdown', async (e) => {
          const btnElem = e.target.closest('.tc-delete-btn');
          if (!btnElem) return;
          const id = btnElem.getAttribute('data-id');
          
          const contactToRemove = currentContacts.find(c => c.id === id);
          if (!contactToRemove) return;

          const isConfirmed = window.confirm(`Are you sure you want to delete ${contactToRemove.name}?`);
          if (!isConfirmed) return;

          currentContacts = currentContacts.filter(c => c.id !== id);
          renderContacts();

          const user = auth.currentUser;
          if (user) {
            setDoc(doc(db, 'users', user.uid), {
              trustedContacts: arrayRemove(contactToRemove)
            }, { merge: true }).catch(error => {
              console.error("Error removing trusted contact:", error);
            });
          } else {
            localStorage.setItem('trustedContacts', JSON.stringify(currentContacts));
          }
        });
      });
    }

    // Load initially when auth state resolves
    auth.onAuthStateChanged((user) => {
      loadTrustedContacts();
    });
  }

  // Trusted Contacts overlay logic
  const btnTrustedContacts = document.getElementById('trusted-contacts-btn');
  const tcPage = document.getElementById('trusted-contacts-page');
  const tcBackBtn = document.getElementById('back-trusted-contacts');
  const tcDoneBtn = document.getElementById('done-trusted-contacts');

  if (btnTrustedContacts && tcPage && tcBackBtn && tcDoneBtn) {
    btnTrustedContacts.addEventListener('pointerdown', () => {
      tcPage.classList.remove('hidden');
    });

    const closeTcPage = () => {
      tcPage.classList.add('hidden');
    };

    tcBackBtn.addEventListener('pointerdown', closeTcPage);
    tcDoneBtn.addEventListener('pointerdown', closeTcPage);
  }

  // Safety overlay logic
  const btnSafety = document.getElementById('safety-btn');
  const safetyPage = document.getElementById('safety-page');
  const safetyBackBtn = document.getElementById('back-safety');

  if (btnSafety && safetyPage && safetyBackBtn) {
    btnSafety.addEventListener('pointerdown', () => {
      safetyPage.classList.remove('hidden');
    });

    safetyBackBtn.addEventListener('pointerdown', () => {
      safetyPage.classList.add('hidden');
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

    // Check URL parameters for tab selection
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'profile') {
      navProfile.dispatchEvent(new Event('pointerdown'));
    }
  }
});
