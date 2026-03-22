import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { env } from '../src/config/env.js';

const app = initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
});

const db = getFirestore(app);

async function wipeDatabase() {
  console.log('Borrando base de datos...');
  const collections = ['inventario', 'proveedores', 'sesiones'];

  for (const collName of collections) {
    console.log(`Borrando coleccion ${collName}...`);
    const q = collection(db, collName);
    const snap = await getDocs(q);
    
    let cnt = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, collName, d.id));
      cnt++;
    }
    console.log(`Borrados ${cnt} documentos en ${collName}.`);
  }
  
  console.log('Listo.');
  process.exit(0);
}

wipeDatabase().catch(e => {
  console.error(e);
  process.exit(1);
});
