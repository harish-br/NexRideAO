import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

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

import { getAuth } from "firebase/auth";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "nexrideao");
export const storage = getStorage(app);
export const auth = getAuth(app);

// Initialize analytics only if window is defined (to prevent SSR issues if any, though this is a standard Vite app)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
