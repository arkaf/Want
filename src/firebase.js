import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDvkCb9uX9_sdDIk6BJf4rxhBHh6Y_XJNg",
  authDomain: "want-b11f0.firebaseapp.com",
  projectId: "want-b11f0",
  storageBucket: "want-b11f0.appspot.com",
  messagingSenderId: "151163979862",
  appId: "1:151163979862:web:46913d57547e1a29c413f7",
  measurementId: "G-V9SG7LJ8VR"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);

// Helper functions for common operations
export async function saveLink(item) {
  try {
    const docRef = await addDoc(collection(db, "links"), {
      ...item,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { id: docRef.id, ...item };
  } catch (error) {
    console.error("Error saving link:", error);
    throw error;
  }
}

export async function loadLinks() {
  try {
    const snapshot = await getDocs(collection(db, "links"));
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error loading links:", error);
    throw error;
  }
}

export async function deleteLink(docId) {
  try {
    await deleteDoc(doc(db, "links", docId));
    return true;
  } catch (error) {
    console.error("Error deleting link:", error);
    throw error;
  }
}

export default app;
