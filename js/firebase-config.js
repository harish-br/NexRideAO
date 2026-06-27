// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

import { getStorage } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

const stripQuotes = (str) => typeof str === 'string' ? str.replace(/^["']|["']$/g, '') : str;

const firebaseConfig = {
    apiKey: stripQuotes(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: stripQuotes(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    databaseURL: stripQuotes(import.meta.env.VITE_FIREBASE_DATABASE_URL),
    projectId: stripQuotes(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: stripQuotes(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: stripQuotes(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: stripQuotes(import.meta.env.VITE_FIREBASE_APP_ID),
    measurementId: stripQuotes(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID)
};

console.log("[DEBUG] Firebase Config loaded:", firebaseConfig);

// Initialize Firebase only if API key is provided (prevents crashing if not setup)
let app, db, auth, firestore, storage;
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        
        // Connect to the specific named database 'nexrideao' instead of '(default)'
        firestore = getFirestore(app, "nexrideao");
        storage = getStorage(app);
        
        console.log("Firebase initialized successfully");
    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
} else {
    console.warn("Firebase config is using placeholder values. Real-time database connection is disabled.");
}

export { db, auth, firestore, storage };
