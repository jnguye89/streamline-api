import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config();
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS in .env");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "streamline-39164.firebasestorage.app",
  });
}

export const bucket = admin.storage().bucket();
export const auth = admin.auth();
export const firestore = admin.firestore();
