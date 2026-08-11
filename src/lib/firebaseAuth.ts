import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { saveGoogleDriveAuthToFirestore, getUserConfigFromFirestore } from './firebaseStore';

// Reuse initialized app instance
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Google Drive scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Load Google auth token from Firestore if not in cache
      if (!cachedAccessToken) {
        try {
          const config = await getUserConfigFromFirestore(user.uid);
          if (config?.googleAccessToken) {
            // Check token expiration in Firestore
            if (config.googleTokenExpiresAt) {
              const expiresAt = new Date(config.googleTokenExpiresAt).getTime();
              if (Date.now() < expiresAt) {
                cachedAccessToken = config.googleAccessToken;
              } else {
                console.info('Stored Google Drive access token expired; falling back to Firebase ID token.');
              }
            } else {
              cachedAccessToken = config.googleAccessToken;
            }
          }
          if (!cachedAccessToken) {
            const stored = localStorage.getItem('nexus_user_session');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (parsed.accessToken) {
                cachedAccessToken = parsed.accessToken;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse user session from Firestore/local', e);
        }
      }

      if (!cachedAccessToken) {
        try {
          cachedAccessToken = await user.getIdToken();
        } catch (e) {
          console.error('Failed to obtain Firebase ID token', e);
        }
      }

      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('nexus_user_session');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string; tokenExpiresAt: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google OAuth access token from Firebase Authentication.');
    }

    cachedAccessToken = credential.accessToken;

    // Save Google Auth Token and Expiration into Firebase Firestore
    const { tokenExpiresAt } = await saveGoogleDriveAuthToFirestore(result.user.uid, cachedAccessToken);

    return { user: result.user, accessToken: cachedAccessToken, tokenExpiresAt };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const emailSignIn = async (email: string, pass: string): Promise<{ user: User; accessToken: string }> => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  const token = await result.user.getIdToken();
  cachedAccessToken = token;
  return { user: result.user, accessToken: token };
};

export const emailSignUp = async (email: string, pass: string, name: string): Promise<{ user: User; accessToken: string }> => {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (name) {
    await updateProfile(result.user, { displayName: name });
  }
  const token = await result.user.getIdToken();
  cachedAccessToken = token;
  return { user: result.user, accessToken: token };
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const deleteAccount = async () => {
  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
    cachedAccessToken = null;
  }
};
