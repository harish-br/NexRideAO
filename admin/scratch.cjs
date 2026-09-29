const admin = require('firebase-admin');
const serviceAccount = require('./nexride-ao-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  const snap = await db.collection('users').get();
  console.log(`Found ${snap.size} users.`);
  snap.forEach(doc => {
    console.log(doc.id, '->', doc.data().name || doc.data().phone || doc.data().phoneNumber || 'No info');
  });
  process.exit(0);
}
run();
