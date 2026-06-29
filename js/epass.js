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
        const passRef = doc(firestore, 'users', userId, 'epass', 'latest');
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
        try {
            const barcodeRef = doc(firestore, 'users', userId, 'barcode', 'latest');
            await setDoc(barcodeRef, {
                passId: passData.passId,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error("Failed to save barcode separate document:", e);
        }

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
    const card = document.getElementById('epass-card-element');

    let sigStr = "GUEST0000NOBUS00";

    // UI elements
    const nameEl = document.getElementById('epass-name');
    const idEl = document.getElementById('epass-id');
    const busEl = document.getElementById('epass-bus');
    const stageEl = document.getElementById('epass-stage');
    const feesEl = document.getElementById('epass-fees');
    const contactEl = document.getElementById('epass-contact');
    const profilePicEl = document.getElementById('epass-profile-pic');

    // Default SVG Icon Data URI
    const defaultProfilePic = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23007aff'><circle cx='12' cy='8' r='4' /><ellipse cx='12' cy='17' rx='7' ry='3.5' /></svg>";

    if (userId) {
        try {
            let data = null;

            // Fetch root user doc for stage, fees_status, and potentially name/photo
            const userRef = doc(firestore, 'users', userId);
            const userSnap = await getDoc(userRef);
            const rootData = userSnap.exists() ? userSnap.data() : {};

            // Try fetching DigitalID first
            const digitalIdRef = doc(firestore, 'users', userId, 'DigitalID', 'userpass');
            const digitalIdSnap = await getDoc(digitalIdRef);

            if (digitalIdSnap.exists()) {
                data = digitalIdSnap.data();
            } else {
                // Fallback to standard user profile if DigitalID is not created yet
                const profileRef = doc(firestore, 'users', userId, 'profile');
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    data = profileSnap.data();
                    // Profile uses different field names (studentId, busNumber)
                    data.id = data.studentId;
                    data.bus = data.busNumber;
                }
            }

            if (data) {
                const userName = (rootData.name || data.name || 'USER').toUpperCase();
                const userIdNum = (rootData.regno || data.id || 'ID000');
                const busNum = (rootData.bus || rootData.busNumber || data.bus || '00');
                const stageStr = (rootData.stage || data.stage || 'N/A');
                const feesStr = (rootData.fees_status || data.fees_status || 'N/A');
                const contactStr = (rootData['parent_gaurdian contact'] || data.contact || 'N/A');
                const profileImgUrl = rootData.photoURL || data.photoURL || data.profilePic || data.avatar || data.profileImageUrl || null;

                const nameNoSpace = userName.replace(/\s+/g, '');
                sigStr = `${nameNoSpace}${userIdNum}BUSNO${busNum}`;

                // Update UI elements inside the card
                if (nameEl) nameEl.textContent = userName;
                if (idEl) idEl.textContent = userIdNum;
                if (busEl) busEl.textContent = busNum;
                if (stageEl) stageEl.textContent = stageStr;
                if (contactEl) contactEl.textContent = contactStr;
                if (feesEl) {
                    feesEl.textContent = feesStr;
                    feesEl.style.color = (feesStr.toLowerCase() === 'paid') ? '#10B981' : '#EF4444'; // Green if paid, Red otherwise
                }
                if (profilePicEl) {
                    profilePicEl.src = profileImgUrl ? profileImgUrl : defaultProfilePic;
                }
            } else {
                sigStr = `${userId.substring(0, 6)}PASSBUS00`.toUpperCase();

                // Fallback UI
                if (nameEl) nameEl.textContent = "GUEST PASS";
                if (idEl) idEl.textContent = userId.substring(0, 6);
                if (busEl) busEl.textContent = `N/A`;
                if (stageEl) stageEl.textContent = `N/A`;
                if (contactEl) contactEl.textContent = `N/A`;
                if (feesEl) {
                    feesEl.textContent = `N/A`;
                    feesEl.style.color = '#111827';
                }
                if (profilePicEl) profilePicEl.src = defaultProfilePic;
            }
        } catch (e) {
            console.error("Failed to fetch DigitalID for e-pass:", e);
            sigStr = `${userId.substring(0, 6)}PASSBUS00`.toUpperCase();

            // Fallback UI on error
            if (nameEl) nameEl.textContent = "GUEST PASS";
            if (idEl) idEl.textContent = userId.substring(0, 6);
            if (busEl) busEl.textContent = `N/A`;
            if (stageEl) stageEl.textContent = `N/A`;
            if (contactEl) contactEl.textContent = `N/A`;
            if (feesEl) {
                feesEl.textContent = `N/A`;
                feesEl.style.color = '#111827';
            }
            if (profilePicEl) profilePicEl.src = defaultProfilePic;
        }
    } else {
        // Fallback UI if not logged in
        if (nameEl) nameEl.textContent = "GUEST PASS";
        if (idEl) idEl.textContent = `GUEST`;
        if (busEl) busEl.textContent = `N/A`;
        if (stageEl) stageEl.textContent = `N/A`;
        if (contactEl) contactEl.textContent = `N/A`;
        if (feesEl) {
            feesEl.textContent = `N/A`;
            feesEl.style.color = '#111827';
        }
        if (profilePicEl) profilePicEl.src = defaultProfilePic;
    }

    // 2. Generate Passport Microprint Pattern Background
    if (card) {
        // Continuous text without spaces
        const microText = sigStr.repeat(10);

        // We generate a simple SVG that acts as a tileable background pattern
        const microPatternSVG = `
            <svg xmlns="http://www.w3.org/2000/svg" width="300" height="20">
                <text x="0" y="14" fill="white" font-family="monospace" font-size="5px" font-weight="600" letter-spacing="1px" opacity="0.8">
                    ${microText}
                </text>
            </svg>
        `.trim();

        // URL-encode the SVG to use it safely in a data URI
        const encodedSVG = encodeURIComponent(microPatternSVG)
            .replace(/'/g, "%27")
            .replace(/"/g, "%22");

        // Apply the CSS variable for the ::before element to consume
        card.style.setProperty('--micro-pattern', `url("data:image/svg+xml,${encodedSVG}")`);
    }
}

function initCardHologram() {
    const card = document.getElementById('epass-card-element');

    if (!card) return;

    let targetTiltX = 0;
    let targetTiltY = 0;
    let targetShinePos = 50;
    let targetBaseOpacity = 0.05;

    let currentTiltX = 0;
    let currentTiltY = 0;
    let currentShinePos = 50;
    let currentBaseOpacity = 0.05;

    // Smooth LERP animation loop (optimized for GPU)
    function renderHologramFrame() {
        // Use 0.12 for smooth, jitter-free damping
        currentTiltX += (targetTiltX - currentTiltX) * 0.12;
        currentTiltY += (targetTiltY - currentTiltY) * 0.12;
        currentShinePos += (targetShinePos - currentShinePos) * 0.12;
        currentBaseOpacity += (targetBaseOpacity - currentBaseOpacity) * 0.12;

        card.style.setProperty('--tilt-x', currentTiltX);
        card.style.setProperty('--tilt-y', currentTiltY);
        card.style.setProperty('--shine-pos', currentShinePos);
        card.style.setProperty('--base-opacity', currentBaseOpacity);

        requestAnimationFrame(renderHologramFrame);
    }
    requestAnimationFrame(renderHologramFrame);

    function handleOrientation(event) {
        let gamma = event.gamma;
        let beta = event.beta;

        if (gamma === null || beta === null) return;

        // X tilt moves the pattern slightly left/right (parallax)
        targetTiltX = Math.max(-10, Math.min(10, gamma));

        // Y tilt moves the pattern up/down
        targetTiltY = Math.max(-10, Math.min(10, beta - 45));

        // Sweep the shine across based on gamma (left/right tilt)
        // Gamma mapped to 0% -> 100% position, increased sensitivity (-15 to 15 instead of -45 to 45)
        targetShinePos = ((Math.max(-15, Math.min(15, gamma)) + 15) / 30) * 100;

        // Change opacity based on vertical tilt (beta)
        // Normal angle (~45 deg) -> 0.1. Tilted slightly -> quickly reaches 0.5
        let betaDiff = Math.abs(beta - 45);
        targetBaseOpacity = 0.1 + (Math.min(15, betaDiff) / 15) * 0.45;
    }

    // Android automatically binds
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    // iOS 13+ requires tap gesture
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        let isBound = false;

        window.requestEpassMotionPermission = () => {
            if (isBound) return;

            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        localStorage.setItem('epass_motion_granted', 'true');
                        window.addEventListener('deviceorientation', handleOrientation);
                        isBound = true;
                    }
                })
                .catch(e => {
                    console.warn("Device orientation request failed:", e);
                });
        };

        // Try to bind automatically on load if previously granted
        if (localStorage.getItem('epass_motion_granted') === 'true') {
            window.requestEpassMotionPermission();
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initCardHologram();

    // Add listener to re-trigger document creation when the e-pass is opened manually
    const epassBtn = document.getElementById('epass-btn');
    if (epassBtn) {
        epassBtn.addEventListener('click', async () => {
            if (auth && auth.currentUser) {
                // Request motion permission if on iOS
                if (window.requestEpassMotionPermission) {
                    window.requestEpassMotionPermission();
                }

                // Temporarily disable the loaded flag to force a re-check
                barcodeLoaded = false;

                // Show global circle loading animation (app default)
                const splash = document.getElementById('splash-screen');
                if (splash) splash.style.display = 'flex';

                await initializeEPass(auth.currentUser.uid);

                // Hide loader once done
                if (splash) splash.style.display = 'none';
            }
        });
    }
});

// Or call directly if already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        initCardHologram();
        const epassBtn = document.getElementById('epass-btn');
        if (epassBtn) {
            epassBtn.addEventListener('click', async () => {
                if (auth && auth.currentUser) {
                    if (window.requestEpassMotionPermission) {
                        window.requestEpassMotionPermission();
                    }
                    barcodeLoaded = false;
                    await initializeEPass(auth.currentUser.uid);
                }
            });
        }
    }, 100);
}
