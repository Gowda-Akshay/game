import admin from "firebase-admin";

let messaging = null;

const initFirebase = () => {
  if (admin.apps.length > 0) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "PASTE_SERVICE_ACCOUNT_JSON_HERE") {
    console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled.");
    return;
  }

  let serviceAccount = null;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", err.message);
    return;
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging();
    console.log("[Firebase] Admin SDK initialized ✓");
  } catch (err) {
    console.error("[Firebase] Failed to initialize Admin SDK:", err.message);
  }
};

export { initFirebase };

const getMessaging = () => {
  if (!messaging) initFirebase();
  return messaging;
};

export const sendPushNotification = async ({ token, title, body, data = {} }) => {
  if (!getMessaging() || !token) return;

  // FCM requires all data values to be strings
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  try {
    const msgId = await messaging.send({
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
    console.log("[Firebase] Push sent, message ID:", msgId);
  } catch (err) {
    console.warn("[Firebase] Push failed:", err.message);
  }
};

/**
 * Send to multiple FCM tokens (fan-out).
 */
export const sendPushToAll = async ({ tokens, title, body, data = {} }) => {
  if (!getMessaging()) { console.warn("[Firebase] Not initialized, skipping push."); return; }
  if (!tokens?.length) { console.warn("[Firebase] No FCM tokens, skipping push."); return; }
  console.log(`[Firebase] Sending push to ${tokens.length} token(s): "${title}"`);
  await Promise.allSettled(tokens.map((token) => sendPushNotification({ token, title, body, data })));
};
