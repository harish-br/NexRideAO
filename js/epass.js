import { auth, firestore } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let barcodeLoaded = false;

// Initialize E-Pass automatically when user logs in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            await initializeEPass(user.uid);
        } catch (e) {
            console.error("Failed to initialize E-Pass:", e);
        }
    } else {
        // Render mock barcode for UI testing if not logged in
        console.warn("User not logged in. Generating mock E-Pass for UI testing.");
        const mockPassId = generateUUID();
        renderBarcode(mockPassId);
        renderHologram(null);
        barcodeLoaded = true;
    }
});

async function initializeEPass(userId) {
    if (barcodeLoaded) return;

    const now = Date.now();
    let passData = null;

    try {
        const passRef = doc(firestore, 'users', userId, 'epass', 'currentPass');
        const passSnap = await getDoc(passRef);

        if (passSnap.exists()) {
            passData = passSnap.data();
            // Regenerate if expired or revoked
            if (passData.expiresAt < now || !passData.isActive) {
                passData = await generateAndSaveEPass(userId, passRef);
            }
        } else {
            // Generate new pass on first load
            passData = await generateAndSaveEPass(userId, passRef);
        }
    } catch (firebaseError) {
        console.error("Firestore error, generating local fallback pass:", firebaseError);
        // Fallback if Firestore fails (e.g., security rules or offline)
        const passId = generateUUID();
        passData = { passId };
    }

    if (passData && passData.passId) {
        renderBarcode(passData.passId);
        renderHologram(userId);
        barcodeLoaded = true;
    }
}

async function generateAndSaveEPass(userId, passRef) {
    const passId = generateUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (30 * 24 * 60 * 60 * 1000); // Expires in 30 days
    const securityHash = await generateHash(userId, passId, issuedAt);

    const passData = {
        passId,
        issuedAt,
        expiresAt,
        isActive: true,
        securityHash
    };

    await setDoc(passRef, passData);
    return passData;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for non-secure contexts (e.g., testing on LAN over HTTP)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function generateHash(userId, passId, issuedAt) {
    const secretKey = "NEXRIDE_SECURE_EPASS_KEY_V1";
    const payload = userId + passId + secretKey + issuedAt;

    // Web Crypto API requires a secure context (HTTPS or localhost)
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const msgUint8 = new TextEncoder().encode(payload);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        // Simple non-secure fallback for LAN testing if crypto is unavailable
        let hash = 0;
        for (let i = 0; i < payload.length; i++) {
            const char = payload.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'fallback-hash-' + Math.abs(hash).toString(16);
    }
}

function renderBarcode(passId) {
    const displayId = passId.split('-')[0].toUpperCase();
    const displayEl = document.getElementById('pass-id-display');
    if (displayEl) {
        displayEl.textContent = displayId;
    }

    if (window.JsBarcode) {
        JsBarcode("#epass-barcode", passId, {
            format: "CODE128",
            displayValue: false, // We use custom UI text for display
            background: "transparent",
            lineColor: "#000000",
            width: 2.5,
            height: 60,
            margin: 0
        });
    } else {
        console.error("JsBarcode library not loaded. CDN might be blocked.");
    }
}

async function renderHologram(userId) {
    const container = document.getElementById('hologram-strip');
    if (!container) return;

    let sigStr = "GUEST0000NOBUS00";
    if (userId) {
        try {
            const profileRef = doc(firestore, 'users', userId, 'profile');
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                const name = (data.name || 'USER').replace(/\s+/g, '');
                const studentId = (data.studentId || 'ID000');
                const busNumber = (data.busNumber || '00');
                sigStr = `${name}${studentId}BUSNO${busNumber}`.toUpperCase();
            } else {
                sigStr = `${userId.substring(0, 6)}PASSBUS00`.toUpperCase();
            }
        } catch (e) {
            console.error("Failed to fetch profile for hologram:", e);
        }
    }

    // Repeat string to fill the arc
    const repeatedSig = (sigStr + " ").repeat(10);

    const svgHTML = `
        <svg class="holo-svg" viewBox="0 0 300 30" preserveAspectRatio="xMidYMid slice">
            <defs>
                <path id="holoCurve" d="M -50,15 L 350,15" fill="none"/>
                
                <linearGradient id="holoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#9ca3af" />
                    <stop offset="50%" stop-color="#d1d5db" />
                    <stop offset="100%" stop-color="#6b7280" />
                </linearGradient>
                
                <linearGradient id="specularGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="transparent" />
                    <stop offset="50%" stop-color="#fff" />
                    <stop offset="100%" stop-color="transparent" />
                </linearGradient>
            </defs>
            
            <text class="holo-text holo-text-base">
                <textPath href="#holoCurve" startOffset="0%">${repeatedSig}</textPath>
            </text>
            <text class="holo-text holo-text-color">
                <textPath href="#holoCurve" startOffset="0%">${repeatedSig}</textPath>
            </text>
            <text class="holo-text holo-text-highlight">
                <textPath href="#holoCurve" startOffset="0%">${repeatedSig}</textPath>
            </text>
        </svg>
    `;
    container.innerHTML = svgHTML;

    // Dynamic animations removed as requested.
}

function initCardHologram() {
    const card = document.getElementById('epass-card-element');
    const shine = card ? card.querySelector('.epass-card-shine') : null;

    if (!card || !shine) return;

    let targetTx = 0;
    let targetTy = 0;
    let currentTx = 0;
    let currentTy = 0;

    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;

    // Smooth LERP animation loop (optimized for GPU)
    function renderHologramFrame() {
        // Use 0.12 for smooth, jitter-free damping
        currentTx += (targetTx - currentTx) * 0.12;
        currentTy += (targetTy - currentTy) * 0.12;
        currentRotX += (targetRotX - currentRotX) * 0.12;
        currentRotY += (targetRotY - currentRotY) * 0.12;

        // Update variables used by hardware-accelerated transforms
        shine.style.setProperty('--shine-tx', currentTx);
        shine.style.setProperty('--shine-ty', currentTy);
        card.style.setProperty('--card-rotate-x', currentRotX);
        card.style.setProperty('--card-rotate-y', currentRotY);

        // Rainbow reveal trigger
        if (Math.abs(targetTx) > 20 || Math.abs(targetTy) > 20) {
            shine.classList.add('extreme-tilt');
        } else {
            shine.classList.remove('extreme-tilt');
        }

        requestAnimationFrame(renderHologramFrame);
    }
    requestAnimationFrame(renderHologramFrame);

    function handleOrientation(event) {
        let gamma = event.gamma;
        let beta = event.beta;

        if (gamma === null || beta === null) return;
        shine.style.animation = 'none';

        // Constrain rotation to max 6 degrees for performance and subtle premium feel
        targetRotY = Math.max(-6, Math.min(6, gamma));
        targetRotX = Math.max(-6, Math.min(6, (beta - 45))) * -1;

        // Map gamma and beta to pixel translations (max 30px travel)
        // A 15 degree tilt gives full 30px translation
        targetTx = (Math.max(-15, Math.min(15, gamma)) / 15) * 30;
        targetTy = (Math.max(-15, Math.min(15, (beta - 45))) / 15) * 30;
    }

    // Android automatically binds
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    // iOS 13+ requires tap on the card
    card.addEventListener('click', () => {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation);
                    }
                })
                .catch(console.error);
        }
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initCardHologram);
// Or call directly if already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initCardHologram, 100);
}
