import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

const messaging =
  typeof window !== "undefined" && "serviceWorker" in navigator
    ? getMessaging(app)
    : null;

const getApiBase = () =>
  typeof window !== "undefined" && window.location.hostname.endsWith(".onrender.com")
    ? "https://game-api-4bdo.onrender.com"
    : import.meta.env.VITE_API_URL || "http://localhost:5001";

// fetch VAPID key from backend — requires a valid JWT, never exposed publicly
const getVapidKey = async (authToken) => {
  const res = await fetch(`${getApiBase()}/api/auth/vapid-key`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error("Server has not configured push notifications yet.");
  const { vapidKey } = await res.json();
  return vapidKey;
};

/**
 * Request notification permission and return the FCM token.
 * @param {string} authToken  — JWT from login, used to fetch VAPID key securely
 * Throws with a readable message on failure.
 */
export const requestFcmToken = async (authToken) => {
  if (!messaging) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied. Please allow it in your browser settings.");
  }

  let swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
  } catch (err) {
    throw new Error(`Service worker registration failed: ${err.message}`);
  }

  const vapidKey = await getVapidKey(authToken);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });

  if (!token) {
    throw new Error("Could not get FCM token. Check Firebase project settings.");
  }

  console.log("[FCM] Token obtained:", token.slice(0, 20) + "...");
  return token;
};

/**
 * Listen for foreground (in-app) messages.
 */
export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Gaming Zone";
    const body  = payload.notification?.body  ?? "";
    callback({ title, body, data: payload.data });
  });
};
