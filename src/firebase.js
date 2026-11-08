import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyA4_86rgtSCP6ZBUIBS7vVKWXMpL104xI4",
    authDomain: "topoclimbing-dd1ad.firebaseapp.com",
    projectId: "topoclimbing-dd1ad",
    storageBucket: "topoclimbing-dd1ad.firebasestorage.app",
    messagingSenderId: "1060800968958",
    appId: "1:1060800968958:web:d8aa11cac9f0b1c68d0daf",
    measurementId: "G-8L0VF0RHRM"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Caché local persistente: lo que se guarda sin cobertura (p. ej. puntos GPS en la montaña)
// queda en el dispositivo aunque se cierre la página, y se sube al volver la conexión.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
