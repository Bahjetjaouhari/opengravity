import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { env } from './src/config/env.js';

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
});

const db = getFirestore(app);

async function clean() {
  const invCols = await getDocs(collection(db, 'inventario'));
  console.log(`Borrando ${invCols.docs.length} items de inventario...`);
  for (const doc of invCols.docs) {
    await deleteDoc(doc.ref);
  }

  const provCols = await getDocs(collection(db, 'proveedores'));
  console.log(`Borrando ${provCols.docs.length} items de proveedores...`);
  for (const doc of provCols.docs) {
    await deleteDoc(doc.ref);
  }
  
  const sesCols = await getDocs(collection(db, 'sessions'));
  console.log(`Borrando ${sesCols.docs.length} items de sessiones...`);
  for (const doc of sesCols.docs) {
    await deleteDoc(doc.ref);
  }
  console.log('Database vaciada correctamente.');
}
clean().catch(console.error);
