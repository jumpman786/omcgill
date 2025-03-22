import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";

// Firebase configuration 
const firebaseConfig = {
  apiKey: "AIzaSyB3kXxYFiPWLiOmVN62qVkmt2xC1rWaaVQ",
  authDomain: "omcgill-36047.firebaseapp.com",
  projectId: "omcgill-36047",
  storageBucket: "omcgill-36047.appspot.com",
  messagingSenderId: "702998333680",
  appId: "1:702998333680:web:c89289dd144c370e0c9a35"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const actionCodeSettings = {
  url: window.location.origin + '/verify-email',
  handleCodeInApp: false // Set to false for email verification links
};

// Set up emulator for local development if needed
if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true') {
  const authEmulatorHost = process.env.REACT_APP_AUTH_EMULATOR_HOST || 'localhost:9099';
  connectAuthEmulator(auth, `http://${authEmulatorHost}`);
  console.log(`Using Firebase Auth Emulator: ${authEmulatorHost}`);
}

export { auth };