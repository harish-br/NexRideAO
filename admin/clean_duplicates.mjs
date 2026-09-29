import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

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
const db = getFirestore(app, "nexrideao");

async function clean() {
  const usersRef = collection(db, 'users');
  const snap = await getDocs(usersRef);
  
  const byPhone = {};
  
  snap.forEach(d => {
    const data = d.data();
    const raw = data.phone || data.mobile || data.phoneNumber || data.cleanPhone || '';
    const cleanNum = String(raw).replace(/\D/g, '').slice(-10);
    
    if (cleanNum && cleanNum.length === 10) {
      if (!byPhone[cleanNum]) byPhone[cleanNum] = [];
      byPhone[cleanNum].push(d);
    }
  });

  for (const [phone, docs] of Object.entries(byPhone)) {
    if (docs.length > 1) {
      console.log(`Found duplicates for phone ${phone}: ${docs.length} docs`);
      
      docs.sort((a, b) => {
        const aIsUid = a.id.length > 15 && !a.id.includes('+') ? 1 : 0;
        const bIsUid = b.id.length > 15 && !b.id.includes('+') ? 1 : 0;
        return bIsUid - aIsUid; // UIDs first
      });
      
      const keep = docs[0];
      console.log(`  Keeping: ${keep.id}`);
      
      for (let i = 1; i < docs.length; i++) {
        const toDelete = docs[i];
        console.log(`  Deleting duplicate: ${toDelete.id}`);
        await deleteDoc(doc(db, 'users', toDelete.id));
      }
    }
  }
  console.log('Cleanup finished.');
  process.exit(0);
}
clean().catch(console.error);
