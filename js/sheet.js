import { firestore as db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc, setDoc, collection, addDoc, serverTimestamp, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('content-container');
  const handle = document.querySelector('.drag-handle-area');

  // Utility to calculate pixels from vh
  const vhToPx = (vh) => (vh * window.innerHeight) / 100;

  let snapPoints = {
    DEFAULT: -vhToPx(60), // Exactly bottom half
    FULL: -(window.innerHeight - 120) // Leaves exactly 120px gap at the top for all devices
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
      FULL: -(window.innerHeight - 120) // Consistent gap on resize
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

  const showToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? '#EF4444' : '#10B981'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const renderContacts = () => {
    if (!contactList) return;
    contactList.innerHTML = '';

    if (currentContacts.length === 0) {
      return;
    }

    currentContacts.forEach(contact => {
      const initial = contact.name.charAt(0).toUpperCase();
      const card = document.createElement('div');
      card.className = 'tc-card';
      card.style.cssText = 'background: #FFFFFF; border-radius: 16px; padding: 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04);';

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #3B82F6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px; flex-shrink: 0;">
            ${initial}
          </div>
          <div style="flex: 1; overflow: hidden;">
            <div style="font-weight: 600; color: #111827; font-size: 16px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${contact.name}</div>
            <div style="color: #9CA3AF; font-size: 14px; font-weight: normal !important;">${contact.phone}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="tc-delete-btn" data-id="${contact.id}" style="background: transparent; border: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clip-path="url(#clip0_4418_9808)">
                <path d="M21 5.98047C17.67 5.65047 14.32 5.48047 10.98 5.48047C9 5.48047 7.02 5.58047 5.04 5.78047L3 5.98047" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8.5 4.97L8.72 3.66C8.88 2.71 9 2 10.69 2H13.31C15 2 15.13 2.75 15.28 3.67L15.5 4.97" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.85 9.14062L18.2 19.2106C18.09 20.7806 18 22.0006 15.21 22.0006H8.79002C6.00002 22.0006 5.91002 20.7806 5.80002 19.2106L5.15002 9.14062" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10.33 16.5H13.66" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9.5 12.5H14.5" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
              <defs>
                <clipPath id="clip0_4418_9808">
                  <rect width="24" height="24" fill="none"/>
                </clipPath>
              </defs>
            </svg>
          </button>
        </div>
      `;
      contactList.appendChild(card);
    });

    bindDeleteButtons();
  };

  const loadTrustedContacts = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const querySnapshot = await getDocs(collection(db, 'users', user.uid, 'trustedContacts'));
        currentContacts = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort newest first
        currentContacts.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0;
          const bTime = b.createdAt?.toMillis() || 0;
          return bTime - aTime;
        });
      } catch (error) {
        console.error("Error loading trusted contacts:", error);
        showToast("Error loading contacts", true);
      }
    } else {
      currentContacts = [];
    }
    renderContacts();
  };

  if (addContactBtn && contactList) {
    addContactBtn.addEventListener('pointerdown', () => {
      const addContactPage = document.getElementById('add-contact-page');
      if (addContactPage) {
        addContactPage.classList.remove('hidden');
        document.getElementById('new-contact-name').focus();
      }
    });

    const addContactPage = document.getElementById('add-contact-page');
    const backAddContactBtn = document.getElementById('back-add-contact');
    const newContactName = document.getElementById('new-contact-name');
    const newContactPhone = document.getElementById('new-contact-phone');
    const saveNewContactBtn = document.getElementById('save-new-contact-btn');

    if (addContactPage && backAddContactBtn && newContactName && newContactPhone && saveNewContactBtn) {

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

        if (nameValid && phoneValid) {
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
        if (saveNewContactBtn.getAttribute('data-disabled') === 'true') return;

        const name = newContactName.value.trim();
        const rawPhone = newContactPhone.value.replace(/\D/g, '');

        if (!name || rawPhone.length !== 10) {
          showToast("Invalid inputs", true);
          return;
        }

        saveNewContactBtn.setAttribute('data-disabled', 'true');

        // Show loading spinner
        const originalText = saveNewContactBtn.innerHTML;
        saveNewContactBtn.innerHTML = `
          <svg style="animation: spin 1s linear infinite; height: 20px; width: 20px; margin-right: 8px; display: inline-block; vertical-align: middle;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity: 0.25;"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Saving
        `;

        const user = auth.currentUser;
        if (!user) {
          showToast("Please login again", true);
          saveNewContactBtn.innerHTML = originalText;
          saveNewContactBtn.setAttribute('data-disabled', 'false');
          return;
        }

        const phone = `+91${rawPhone}`;

        try {
          console.log("Saving started");
          const newDocRef = await addDoc(collection(db, 'users', user.uid, 'trustedContacts'), {
            name,
            phone,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          console.log("Firestore save success");

          // Toast removed per user request

          // Optimistically update the UI so it's instantly visible
          currentContacts.push({
            id: newDocRef.id,
            name: name,
            phone: phone
          });
          renderContacts();

          console.log("Navigating back");
          closeAddContactPage();

          // Refresh from Firestore in the background
          loadTrustedContacts();

        } catch (err) {
          console.error("Sync error in save logic:", err);
          showToast("Error: " + err.message, true);
        } finally {
          saveNewContactBtn.innerHTML = originalText;
          saveNewContactBtn.setAttribute('data-disabled', 'false');
        }
      });
    }

    // Load initially when auth state resolves
    auth.onAuthStateChanged((user) => {
      loadTrustedContacts();
    });
  }

  function bindDeleteButtons() {
    const deleteBtns = document.querySelectorAll('.tc-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btnElem = e.target.closest('.tc-delete-btn');
        if (!btnElem) return;
        const id = btnElem.getAttribute('data-id');

        const contactToRemove = currentContacts.find(c => c.id === id);
        if (!contactToRemove) return;

        const isConfirmed = window.confirm(`Are you sure you want to delete ${contactToRemove.name}?`);
        if (!isConfirmed) return;

        const user = auth.currentUser;
        if (user) {
          try {
            // Optimistic UI update
            currentContacts = currentContacts.filter(c => c.id !== id);
            renderContacts();

            await deleteDoc(doc(db, 'users', user.uid, 'trustedContacts', id));
            // Toast removed per user request
          } catch (error) {
            console.error("Error removing trusted contact:", error);
            showToast("Failed to delete contact", true);
            await loadTrustedContacts(); // Revert on failure
          }
        } else {
          showToast("Please login again", true);
        }
      });
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

  // E-Pass overlay logic
  const btnEpass = document.getElementById('epass-btn');
  const epassPage = document.getElementById('epass-page');
  const epassBackBtn = document.getElementById('back-epass');

  if (btnEpass && epassPage && epassBackBtn) {
    btnEpass.addEventListener('click', () => {
      epassPage.classList.remove('hidden');
    });

    epassBackBtn.addEventListener('click', () => {
      epassPage.classList.add('hidden');
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
