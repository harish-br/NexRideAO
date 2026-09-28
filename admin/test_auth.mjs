import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc } from "firebase/firestore";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, 'harishsrhr@gmail.com', 'HarisH@thR3121');
    console.log("Logged in as:", userCredential.user.email);
    
    // Now try to add a document
    const docRef = await addDoc(collection(db, "buses"), {
      busNumber: "TestBus",
      registrationNumber: "TN0000",
      status: "Active"
    });
    console.log("Document written with ID: ", docRef.id);
  } catch (e) {
    console.error("Error: ", e.message || e);
  }
}

test();
