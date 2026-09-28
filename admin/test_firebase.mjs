import { initializeApp } from "firebase/app";
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
const db = getFirestore(app);

async function test() {
  try {
    const docRef = await addDoc(collection(db, "buses"), {
      busNumber: "Test"
    });
    console.log("Document written with ID: ", docRef.id);
  } catch (e) {
    console.error("Error adding document: ", e);
  }
}

test();
