import { proveedoresDB } from './src/inventory/db.js';

async function main() {
  console.log('=== Verificando proveedores en la base de datos ===\n');

  // Probar búsqueda con diferentes variaciones
  const nombres = ['Lubass', 'lubass', 'LUBASS', 'Lubas', 'lubas'];

  for (const nombre of nombres) {
    const proveedor = await proveedoresDB.obtenerPorNombre(nombre);
    console.log(`Buscando "${nombre}": ${proveedor ? `ENCONTRADO - ${JSON.stringify(proveedor)}` : 'NO ENCONTRADO'}`);
  }

  // También verificar todos los proveedores en la colección
  console.log('\n=== Listando todos los proveedores ===');
  const { getDocs, collection, getFirestore } = await import('firebase/firestore');
  const { initializeApp, getApps } = await import('firebase/app');
  const { env } = await import('./src/config/env.js');

  const app = getApps().length ? getApps()[0] : initializeApp({
    apiKey: env.FIREBASE_API_KEY,
    authDomain: env.FIREBASE_AUTH_DOMAIN,
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
    appId: env.FIREBASE_APP_ID
  });

  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'proveedores'));
  console.log(`Total proveedores: ${snap.docs.length}`);
  snap.docs.forEach(doc => {
    console.log(`- ${doc.id}: ${JSON.stringify(doc.data())}`);
  });

  process.exit(0);
}

main().catch(console.error);