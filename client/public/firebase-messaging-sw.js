importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyB0rLuaJ3GoD3CbfroXUi2hXVkXYRjkyi0",
  authDomain:        "game-af02b.firebaseapp.com",
  projectId:         "game-af02b",
  storageBucket:     "game-af02b.firebasestorage.app",
  messagingSenderId: "875249780366",
  appId:             "1:875249780366:web:63bf3bae9d75642c67ebdf",
});

const messaging = firebase.messaging();

// Show notification when app is in background / closed
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Gaming Zone";
  const body  = payload.notification?.body  ?? "";

  self.registration.showNotification(title, {
    body,
    icon:  "/vite.svg",
    badge: "/vite.svg",
    data:  payload.data ?? {},
  });
});
