// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBWS5Ah5TNrdrZFiTPG6WY0bG8c2BvFrb8",
    authDomain: "nexride-ao.firebaseapp.com",
    databaseURL: "https://nexride-ao-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "nexride-ao",
    storageBucket: "nexride-ao.firebasestorage.app",
    messagingSenderId: "683594734736",
    appId: "1:683594734736:web:ccbbed5510277bcca58c15",
    measurementId: "G-S5XY5GEPZE"
};

// Initialize Firebase only if API key is provided (prevents crashing if not setup)
let app, db, auth, firestore;
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        firestore = getFirestore(app);
        console.log("Firebase initialized successfully");
    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
} else {
    console.warn("Firebase config is using placeholder values. Real-time database connection is disabled.");
}

export { db, auth, firestore };
