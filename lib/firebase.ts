import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App | undefined;

function init(): App {
  if (getApps().length) return getApps()[0]!;

  // Prefer JSON blob env var (Vercel); fall back to individual fields
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const sa = JSON.parse(json);
    app = initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: String(sa.private_key).replace(/\\n/g, "\n"),
      }),
    });
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    throw new Error(
      "Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (or PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY)."
    );
  }
  return app;
}

export function adminAuth() {
  return getAuth(init());
}

export function db(): Firestore {
  return getFirestore(init());
}

export const USERS = "users";
