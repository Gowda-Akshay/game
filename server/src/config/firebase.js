import admin from "firebase-admin";
import { createRequire } from "module";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let messaging = null;

const initFirebase = () => {
  if (admin.apps.length > 0) return;

  // prefer local JSON file over env var (avoids dotenv multiline issues)
  const jsonPath = resolve(__dirname, "../../firebase-service-account.json");

  let serviceAccount = null;

  if (existsSync(jsonPath)) {
    try {
      serviceAccount = require(jsonPath);
    } catch (err) {
      console.error("[Firebase] Failed to load service account file:", err.message);
      return;
    }
  } else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw || raw === "PASTE_SERVICE_ACCOUNT_JSON_HERE") {
      console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled.");
      return;
    }
    try {
      serviceAccount = JSON.parse(raw.replace(/\\n/g, "\n"));
    } catch (err) {
      console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", err.message);
      return;
    }
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging();
    console.log("[Firebase] Admin SDK initialized ✓");
  } catch (err) {
    console.error("[Firebase] Failed to initialize Admin SDK:", err.message);
  }
};

initFirebase();

/**
 * Send a push notification to a single FCM token.
 * Silently no-ops if Firebase is not configured.
 */
export const sendPushNotification = async ({ token, title, body, data = {} }) => {
  if (!messaging || !token) return;

  // FCM requires all data values to be strings
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  try {
    await messaging.send({
      token,
      notification: { title, body },
      data: stringData,
      webpush: {
        notification: {
          title,
          body,
          icon: "/vite.svg",
          badge: "/vite.svg",
          requireInteraction: false
        },
        fcmOptions: { link: "/" }
      }
    });
  } catch (err) {
    // Token may be stale — log but don't crash
    console.warn("[Firebase] Push failed:", err.message);
  }
};

/**
 * Send to multiple FCM tokens (fan-out).
 */
export const sendPushToAll = async ({ tokens, title, body, data = {} }) => {
  if (!messaging) { console.warn("[Firebase] Not initialized, skipping push."); return; }
  if (!tokens?.length) { console.warn("[Firebase] No FCM tokens, skipping push."); return; }
  console.log(`[Firebase] Sending push to ${tokens.length} token(s): "${title}"`);
  await Promise.allSettled(tokens.map((token) => sendPushNotification({ token, title, body, data })));
};
