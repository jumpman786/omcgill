// utils/firebaseAuth.js
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail  } from "firebase/auth";
  import { auth } from "../firebase";
  
  // Utility function to handle Firebase error messages
  export const handleFirebaseError = (error) => {
    console.error("Firebase error:", error);
    
    const errorMessages = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'The email address is invalid.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account with this email was found.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/operation-not-allowed': 'Operation not allowed.',
      'auth/too-many-requests': 'Too many unsuccessful login attempts. Try again later.',
      'auth/network-request-failed': 'Network error. Check your internet connection.',
    };
    
    return errorMessages[error.code] || error.message || 'An error occurred during authentication.';
  };
  
  export const actionCodeSettings = {
    url: window.location.origin + '/verify-email',
    handleCodeInApp: false // Set to false for email verification links
  };
  
  // Firebase register function
  export const registerWithFirebase = async (email, password) => {
    try {
      // Create the user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Send email verification with action code settings
      await sendEmailVerification(userCredential.user, actionCodeSettings);
      
      return {
        success: true,
        user: userCredential.user,
        message: 'Registration successful! Please check your email to verify your account.'
      };
    } catch (error) {
      return {
        success: false,
        error: handleFirebaseError(error)
      };
    }
  };
  
  // Firebase login function
  export const loginWithFirebase = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get the Firebase token
      const token = await user.getIdToken();
      
      return {
        success: true,
        user,
        token,
        emailVerified: user.emailVerified
      };
    } catch (error) {
      return {
        success: false,
        error: handleFirebaseError(error)
      };
    }
  };
  
  // Firebase password reset function
  export const resetPasswordWithFirebase = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        message: `Password reset email sent to ${email}`
      };
    } catch (error) {
      return {
        success: false,
        error: handleFirebaseError(error)
      };
    }
  };