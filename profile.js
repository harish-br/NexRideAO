import { auth, firestore } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let currentUser = null;

// Personal Info DOM
const valName = document.getElementById('val-name');
const valGender = document.getElementById('val-gender');
const valPhone = document.getElementById('val-phone');
const valEmail = document.getElementById('val-email');
const phoneBadge = document.getElementById('val-phone-badge');
const phoneVerifiedText = document.getElementById('val-phone-verified-text');
const piEditBtn = document.getElementById('pi-edit-btn');
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

// Initial Load / Auth State
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            if (user.phoneNumber) {
                valPhone.textContent = user.phoneNumber;
                phoneBadge.style.display = 'inline-block';
                phoneVerifiedText.style.display = 'inline-block';
                upInputPhone.value = user.phoneNumber;
            } else {
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

function resetToDefault() {
    valName.textContent = "Add your name";
    if (profileUserNameDisplay) profileUserNameDisplay.textContent = "User";
    valGender.textContent = "Select gender";
    valEmail.textContent = "Add email";
    valEmail.style.color = '#1A73E8';
    valPhone.textContent = "";
    phoneBadge.style.display = 'none';
    phoneVerifiedText.style.display = 'none';
    upInputPhone.value = "";
}

async function fetchUserProfile(uid) {
    if (!firestore) return;
    try {
        const docRef = doc(firestore, 'users', uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.name) {
                valName.textContent = data.name;
                if (profileUserNameDisplay) profileUserNameDisplay.textContent = data.name;
            }
            if (data.gender) valGender.textContent = data.gender;
            if (data.email) {
                valEmail.textContent = data.email;
                valEmail.style.color = '#111111';
            }
        } else {
            // New User flow: Automatically push the Update Profile screen
            openUpdateProfile();
        }
    } catch (err) {
        console.error("Error fetching profile:", err);
    }
}

// Navigation Logic
piEditBtn.addEventListener('click', () => {
    if (!currentUser) {
        // Simulating edit flow for demo if not logged in
        console.warn("User not logged in. Opening in local simulation mode.");
        openUpdateProfile();
        return;
    }
    openUpdateProfile();
});

upBackBtn.addEventListener('click', closeUpdateProfile);

function openUpdateProfile() {
    upErrorMsg.classList.add('hidden');
    
    // Pre-fill inputs
    upInputName.value = valName.textContent !== "Add your name" ? valName.textContent : "";
    upInputEmail.value = valEmail.textContent !== "Add email" ? valEmail.textContent : "";
    upInputGender.value = valGender.textContent !== "Select gender" ? valGender.textContent : "Male";
    
    if (currentUser && currentUser.phoneNumber) {
        upInputPhone.value = currentUser.phoneNumber;
    }
    
    updateProfilePage.classList.remove('hidden');
}

function closeUpdateProfile() {
    updateProfilePage.classList.add('hidden');
}

// Save Logic
upContinueBtn.addEventListener('click', async () => {
    const newName = upInputName.value.trim();
    const newEmail = upInputEmail.value.trim();
    const newGender = upInputGender.value;
    
    if (newName === '') {
        showError("Full Name cannot be empty.");
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (newEmail === '' || !emailRegex.test(newEmail)) {
        showError("Please enter a valid email address.");
        return;
    }
    
    upErrorMsg.classList.add('hidden');
    upContinueBtn.textContent = "Saving...";
    upContinueBtn.style.opacity = "0.7";
    upContinueBtn.disabled = true;
    
    try {
        const data = {
            name: newName,
            email: newEmail,
            gender: newGender,
            updatedAt: serverTimestamp()
        };
        
        if (valName.textContent === "Add your name" && valEmail.textContent === "Add email") {
            data.createdAt = serverTimestamp();
            if (currentUser && currentUser.phoneNumber) {
                data.phone = currentUser.phoneNumber;
            }
        }
        
        if (firestore && currentUser) {
            const docRef = doc(firestore, 'users', currentUser.uid);
            await setDoc(docRef, data, { merge: true });
        } else {
            console.warn("Firestore/Auth not initialized. Simulating save locally.");
        }
        
        // Update Personal Info UI locally
        valName.textContent = newName;
        if (profileUserNameDisplay) profileUserNameDisplay.textContent = newName;
        valGender.textContent = newGender;
        valEmail.textContent = newEmail;
        valEmail.style.color = '#111111';
        
        closeUpdateProfile();
    } catch (err) {
        console.error("Error saving to Firestore:", err);
        showError("Failed to save changes. Check your connection.");
    } finally {
        upContinueBtn.textContent = "Continue";
        upContinueBtn.style.opacity = "1";
        upContinueBtn.disabled = false;
    }
});

function showError(msg) {
    upErrorMsg.textContent = msg;
    upErrorMsg.classList.remove('hidden');
}
