import { auth, firestore, storage } from './firebase-config.js';
import { onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

let currentUser = null;
let processedPhoto = null; // { dataUrl: string, blob: Blob }

// Personal Info DOM
const valName = document.getElementById('val-name');
const valGender = document.getElementById('val-gender');
const valPhone = document.getElementById('val-phone');
const valEmail = document.getElementById('val-email');
const phoneBadge = document.getElementById('val-phone-badge');
const phoneVerifiedText = document.getElementById('val-phone-verified-text');
const piEditBtn = document.getElementById('pi-edit-btn');
const piAvatarCustom = document.getElementById('pi-avatar-custom');
const piProfileImg = document.getElementById('pi-profile-img');
const piDefaultSvg = document.getElementById('pi-default-svg');
const profileUserNameDisplay = document.getElementById('profile-user-name-display');

// Update Profile DOM
const updateProfilePage = document.getElementById('update-profile-page');
const upBackBtn = document.getElementById('up-back-btn');
const upInputName = document.getElementById('up-input-name');
const upInputPhone = document.getElementById('up-input-phone');
const upInputEmail = document.getElementById('up-input-email');
const upInputGender = document.getElementById('up-input-gender');
const upErrorMsg = document.getElementById('up-error-msg');
const upContinueBtn = document.getElementById('up-continue-btn');

// Photo DOM
const mainProfileImg = document.getElementById('main-profile-img');
const defaultProfileSvg = document.getElementById('default-profile-svg');
const upPhotoContainer = document.getElementById('up-photo-container');
const upInputPhoto = document.getElementById('up-input-photo');
const upProfilePreview = document.getElementById('up-profile-preview');
const upDefaultSvg = document.getElementById('up-default-svg');

// Clickable Personal Info rows to edit profile
const rowName = document.getElementById('row-name');
const rowGender = document.getElementById('row-gender');
const rowEmail = document.getElementById('row-email');

// Initial cached load for instantaneous zero-flicker UI
try {
    const cachedProfile = localStorage.getItem('nexride_user_profile');
    if (cachedProfile) {
        const cachedData = JSON.parse(cachedProfile);
        applyProfileData(cachedData);
    }
} catch (e) {
    console.warn("[Profile] Error reading cached profile:", e);
}

// Initial Load / Auth State
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            if (user.phoneNumber) {
                if (valPhone) valPhone.textContent = user.phoneNumber;
                if (phoneBadge) phoneBadge.style.display = 'inline-block';
                if (phoneVerifiedText) phoneVerifiedText.style.display = 'inline-block';
                if (upInputPhone) upInputPhone.value = user.phoneNumber;
            } else if (valPhone) {
                valPhone.textContent = "Not verified";
            }
            await fetchUserProfile(user.uid);
        } else {
            currentUser = null;
            resetToDefault();
        }
    });
} else {
    console.warn("Auth not initialized. Using default profile state.");
}

/**
 * Updates all profile images across the entire app
 */
function updateAllProfileImages(photoUrl) {
    if (photoUrl) {
        if (mainProfileImg) {
            mainProfileImg.src = photoUrl;
            mainProfileImg.classList.remove('hidden');
        }
        if (defaultProfileSvg) defaultProfileSvg.classList.add('hidden');

        if (piProfileImg) {
            piProfileImg.src = photoUrl;
            piProfileImg.classList.remove('hidden');
        }
        if (piDefaultSvg) piDefaultSvg.classList.add('hidden');

        if (upProfilePreview) {
            upProfilePreview.src = photoUrl;
            upProfilePreview.classList.remove('hidden');
        }
        if (upDefaultSvg) upDefaultSvg.classList.add('hidden');

        const epassPic = document.getElementById('epass-profile-pic');
        if (epassPic) {
            epassPic.src = photoUrl;
        }
    } else {
        if (mainProfileImg) {
            mainProfileImg.src = "";
            mainProfileImg.classList.add('hidden');
        }
        if (defaultProfileSvg) defaultProfileSvg.classList.remove('hidden');

        if (piProfileImg) {
            piProfileImg.src = "";
            piProfileImg.classList.add('hidden');
        }
        if (piDefaultSvg) piDefaultSvg.classList.add('hidden');

        if (upProfilePreview) {
            upProfilePreview.src = "";
            upProfilePreview.classList.add('hidden');
        }
        if (upDefaultSvg) upDefaultSvg.classList.remove('hidden');
    }
}

let currentUserRole = 'student';

/**
 * Applies profile data fields to DOM elements
 */
function applyProfileData(data) {
    if (!data) return;
    if (data.role) currentUserRole = data.role;

    const upPhotoOverlay = document.querySelector('.up-photo-overlay');
    if (upPhotoOverlay) {
        // Completely disable camera icon overlay for everyone (admin updates this from backend)
        upPhotoOverlay.style.display = 'none';
    }

    const hasCustomName = data.name && data.name !== "User" && data.name !== "Add your name";
    if (valName) valName.textContent = hasCustomName ? data.name : "Add your name";
    if (profileUserNameDisplay) profileUserNameDisplay.textContent = hasCustomName ? data.name : "User";

    if (data.gender && valGender) {
        valGender.textContent = data.gender;
    }
    if (data.email && valEmail) {
        valEmail.textContent = data.email;
        valEmail.style.color = '#111111';
    }
    if (data.phone && valPhone) {
        valPhone.textContent = data.phone;
        if (phoneBadge) phoneBadge.style.display = 'inline-block';
        if (phoneVerifiedText) phoneVerifiedText.style.display = 'inline-block';
        if (upInputPhone) upInputPhone.value = data.phone;
    }

    const photo = data.photoURL || data.profilePic || data.avatar || null;
    if (photo) {
        updateAllProfileImages(photo);
    }
}

function resetToDefault() {
    if (valName) valName.textContent = "Add your name";
    if (profileUserNameDisplay) profileUserNameDisplay.textContent = "User";
    if (valGender) valGender.textContent = "Select gender";
    if (valEmail) {
        valEmail.textContent = "Add email";
        valEmail.style.color = '#1A73E8';
    }
    if (valPhone) valPhone.textContent = "";
    if (phoneBadge) phoneBadge.style.display = 'none';
    if (phoneVerifiedText) phoneVerifiedText.style.display = 'none';
    if (upInputPhone) upInputPhone.value = "";

    updateAllProfileImages(null);
    processedPhoto = null;
}

async function fetchUserProfile(uid) {
    if (!firestore) return;
    try {
        const docRef = doc(firestore, 'users', uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            applyProfileData(data);

            // Update local cache
            try {
                localStorage.setItem('nexride_user_profile', JSON.stringify({ ...data, uid }));
            } catch (e) {}

            const isNewUser = (!data.name || data.name === "User" || data.name === "Add your name");
            if (isNewUser) {
                openUpdateProfile(true);
            }

            // Update lastLogin in background without blocking
            setDoc(docRef, { lastLogin: serverTimestamp() }, { merge: true }).catch(e => 
                console.warn("[Profile] Background lastLogin update failed:", e)
            );
        } else {
            // Create default user profile in database
            const defaultData = {
                uid: uid,
                phone: currentUser && currentUser.phoneNumber ? currentUser.phoneNumber : "",
                name: "User",
                photoURL: null,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            };

            const createPromise = setDoc(docRef, defaultData);
            const timeoutPromise2 = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
            await Promise.race([createPromise, timeoutPromise2]).catch(e => 
                console.warn("[Profile] Background create profile timeout:", e)
            );

            console.log("[DEBUG] Default user profile created in Firestore.");
            openUpdateProfile(true);
        }
    } catch (err) {
        console.error("[Profile] Error fetching profile:", err);
    }
}

/**
 * Compresses and center-crops an image file to a lightweight square avatar.
 * Target: Max 400x400 square JPEG, quality 0.85 (typically ~15KB - 30KB).
 */
function processProfileImage(file, maxDimension = 400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            return reject(new Error('Please select a valid image file.'));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;

                    // Crop to square from center
                    const minDim = Math.min(width, height);
                    const startX = (width - minDim) / 2;
                    const startY = (height - minDim) / 2;

                    const finalDim = Math.min(minDim, maxDimension);
                    canvas.width = finalDim;
                    canvas.height = finalDim;

                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Draw center square crop
                    ctx.drawImage(
                        img,
                        startX, startY, minDim, minDim,
                        0, 0, finalDim, finalDim
                    );

                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    canvas.toBlob((blob) => {
                        resolve({ dataUrl, blob: blob || file });
                    }, 'image/jpeg', quality);
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
}

// Navigation & Trigger Listeners
if (piEditBtn) {
    piEditBtn.addEventListener('click', () => openUpdateProfile());
}

// Photo Upload Selection & Instant Preview
if (upPhotoContainer && upInputPhoto) {
    // completely disabled: users cannot upload their own photos anymore
    // upPhotoContainer.addEventListener('click', ... )

    upInputPhoto.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Show immediate temporary preview while processing
                const tempUrl = URL.createObjectURL(file);
                if (upProfilePreview) {
                    upProfilePreview.src = tempUrl;
                    upProfilePreview.classList.remove('hidden');
                }
                if (upDefaultSvg) upDefaultSvg.classList.add('hidden');

                // Process and optimize image
                processedPhoto = await processProfileImage(file);
                if (upProfilePreview) {
                    upProfilePreview.src = processedPhoto.dataUrl;
                }
            } catch (err) {
                console.error("[Profile] Error processing photo:", err);
                showError("Invalid image file. Please try another image.");
            }
        }
    });
}

if (upBackBtn) {
    upBackBtn.addEventListener('click', closeUpdateProfile);
}

function openUpdateProfile(force = false) {
    if (upErrorMsg) upErrorMsg.classList.add('hidden');

    if (upBackBtn) {
        if (force) {
            upBackBtn.style.display = 'none'; // Hide back button for new users
        } else {
            upBackBtn.style.display = 'block'; // Show it for existing users
        }
    }

    // Pre-fill inputs
    if (upInputName) {
        upInputName.value = (valName && valName.textContent !== "Add your name") ? valName.textContent : "";
    }
    if (upInputEmail) {
        upInputEmail.value = (valEmail && valEmail.textContent !== "Add email") ? valEmail.textContent : "";
    }
    if (upInputGender) {
        upInputGender.value = (valGender && valGender.textContent !== "Select gender") ? valGender.textContent : "Male";
    }
    if (currentUser && currentUser.phoneNumber && upInputPhone) {
        upInputPhone.value = currentUser.phoneNumber;
    }

    // Ensure preview matches current photo
    const currentPhoto = (mainProfileImg && !mainProfileImg.classList.contains('hidden')) ? mainProfileImg.src : null;
    if (currentPhoto && upProfilePreview && upDefaultSvg) {
        upProfilePreview.src = currentPhoto;
        upProfilePreview.classList.remove('hidden');
        upDefaultSvg.classList.add('hidden');
    }

    if (updateProfilePage) {
        updateProfilePage.classList.remove('hidden');
    }
}

function closeUpdateProfile() {
    if (updateProfilePage) {
        updateProfilePage.classList.add('hidden');
    }
    processedPhoto = null;
    if (upInputPhoto) upInputPhoto.value = '';
}


// Save Logic
if (upContinueBtn) {
    upContinueBtn.addEventListener('click', async () => {
        const newName = upInputName ? upInputName.value.trim() : '';
        const newEmail = upInputEmail ? upInputEmail.value.trim() : '';
        const newGender = upInputGender ? upInputGender.value : 'Male';

        if (newName === '') {
            showError("Full Name cannot be empty.", upInputName);
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (newEmail === '' || !emailRegex.test(newEmail)) {
            showError("Please enter a valid email address.", upInputEmail);
            return;
        }

        if (upErrorMsg) upErrorMsg.classList.add('hidden');
        upContinueBtn.innerHTML = `
            <svg class="up-btn-spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-dasharray="38" stroke-linecap="round"></circle>
            </svg>
        `;
        upContinueBtn.style.opacity = "0.85";
        upContinueBtn.disabled = true;

        try {
            const data = {
                name: newName,
                email: newEmail,
                gender: newGender,
                updatedAt: serverTimestamp()
            };

            if (valName && valName.textContent === "Add your name" && valEmail && valEmail.textContent === "Add email") {
                data.createdAt = serverTimestamp();
                if (currentUser && currentUser.phoneNumber) {
                    data.phone = currentUser.phoneNumber;
                }
            }

            // Handle photo upload with resilient dual-storage strategy
            if (processedPhoto) {
                let photoUrlToSave = processedPhoto.dataUrl; // Guaranteed fallback (compressed 20KB base64)

                if (storage && currentUser) {
                    try {
                        const photoRef = ref(storage, `profile_photos/${currentUser.uid}.jpg`);
                        
                        // Strict 4s timeout for Storage upload to prevent hanging
                        const uploadPromise = uploadBytes(photoRef, processedPhoto.blob, {
                            contentType: 'image/jpeg'
                        });
                        const storageTimeout = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error("Storage upload timed out")), 4000)
                        );
                        await Promise.race([uploadPromise, storageTimeout]);

                        const downloadUrlPromise = getDownloadURL(photoRef);
                        const urlTimeout = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("URL fetch timed out")), 3000)
                        );
                        const downloadURL = await Promise.race([downloadUrlPromise, urlTimeout]);

                        if (downloadURL) {
                            photoUrlToSave = downloadURL;
                            console.log("[Profile] Photo stored in Firebase Storage successfully:", downloadURL);
                        }
                    } catch (storageErr) {
                        console.warn("[Profile] Storage upload skipped/failed; saving optimized image to Firestore directly:", storageErr?.message || storageErr);
                        photoUrlToSave = processedPhoto.dataUrl;
                    }
                }

                data.photoURL = photoUrlToSave;
                data.profilePic = photoUrlToSave;
                data.avatar = photoUrlToSave;
            }

            // Save to Firestore
            if (firestore && currentUser) {
                const docRef = doc(firestore, 'users', currentUser.uid);
                console.log("[Profile] Saving user profile to Firestore:", currentUser.uid);

                const savePromise = setDoc(docRef, data, { merge: true });
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout: Could not reach Firestore. Please check your internet connection.")), 8000)
                );

                await Promise.race([savePromise, timeoutPromise]);
                console.log("[Profile] Profile saved to Firestore successfully!");
            } else {
                console.warn("[Profile] Firestore or Auth not active. Simulating save locally.");
            }

            // Sync with Firebase Auth Profile
            if (auth && auth.currentUser) {
                try {
                    await updateProfile(auth.currentUser, {
                        displayName: newName,
                        photoURL: data.photoURL || auth.currentUser.photoURL || null
                    });
                } catch (authProfErr) {
                    console.warn("[Profile] Auth updateProfile notice:", authProfErr?.message);
                }
            }

            // Update local storage cache
            try {
                const existing = JSON.parse(localStorage.getItem('nexride_user_profile') || '{}');
                const merged = { ...existing, ...data, name: newName, email: newEmail, gender: newGender };
                if (data.photoURL) merged.photoURL = data.photoURL;
                localStorage.setItem('nexride_user_profile', JSON.stringify(merged));
            } catch (e) {}

            // Update UI elements across app
            applyProfileData({
                ...data,
                name: newName,
                email: newEmail,
                gender: newGender,
                photoURL: data.photoURL || (mainProfileImg && mainProfileImg.src) || null
            });

            // Dispatch global event for other components (like epass)
            window.dispatchEvent(new CustomEvent('nexride:profileUpdated', {
                detail: {
                    ...data,
                    name: newName,
                    email: newEmail,
                    gender: newGender,
                    uid: currentUser?.uid
                }
            }));

            closeUpdateProfile();
        } catch (err) {
            console.error("[Profile] Error saving profile:", err);
            showError("Error: " + (err.message || "Failed to save profile."));
        } finally {
            upContinueBtn.innerHTML = "Continue";
            upContinueBtn.style.opacity = "1";
            upContinueBtn.disabled = false;
        }
    });
}

function showError(msg, focusEl = null) {
    if (upErrorMsg) {
        upErrorMsg.textContent = msg;
        upErrorMsg.classList.remove('hidden');
    }
    if (focusEl) {
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            focusEl.focus();
            if (typeof focusEl.setSelectionRange === 'function') {
                const len = focusEl.value.length;
                focusEl.setSelectionRange(len, len);
            }
        }, 120);
    }
}
