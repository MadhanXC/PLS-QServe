import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Services
export const auth = getAuth(app);

// Safeguard against IndexedDB connection/closing/hidden errors in iframe/browser preview
setPersistence(auth, indexedDBLocalPersistence).catch(() => {
  return setPersistence(auth, browserLocalPersistence).catch(() => {
    return setPersistence(auth, inMemoryPersistence).catch(() => {});
  });
});

export async function safeSignInWithEmailAndPassword(email: string, pass: string) {
  try {
    return await signInWithEmailAndPassword(auth, email, pass);
  } catch (err: any) {
    if (
      err?.message?.includes('Database is closing') ||
      err?.message?.includes('Database is hidden') ||
      err?.message?.includes('IndexedDB') ||
      err?.code === 'auth/internal-error'
    ) {
      console.warn('IndexedDB issue detected during sign-in, retrying with fallback persistence...');
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (pErr) {
        await setPersistence(auth, inMemoryPersistence);
      }
      return await signInWithEmailAndPassword(auth, email, pass);
    }
    throw err;
  }
}

export async function safeCreateUserWithEmailAndPassword(email: string, pass: string) {
  try {
    return await createUserWithEmailAndPassword(auth, email, pass);
  } catch (err: any) {
    if (
      err?.message?.includes('Database is closing') ||
      err?.message?.includes('Database is hidden') ||
      err?.message?.includes('IndexedDB') ||
      err?.code === 'auth/internal-error'
    ) {
      console.warn('IndexedDB issue detected during user creation, retrying with fallback persistence...');
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (pErr) {
        await setPersistence(auth, inMemoryPersistence);
      }
      return await createUserWithEmailAndPassword(auth, email, pass);
    }
    throw err;
  }
}

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    databaseId || undefined
  );
} catch {
  firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const db = firestoreInstance;

export default app;
