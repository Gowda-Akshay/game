import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { requestFcmToken, onForegroundMessage } from "./firebase.js";

const getApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".onrender.com")) {
    return "https://game-api-4bdo.onrender.com";
  }

  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return "http://localhost:5001";
};

const API_BASE_URL = getApiBaseUrl();
const STORAGE_KEY = "gaming-zone-session";
const initialCustomerForm = {
  customerName: "",
  phoneNumber: "",
  email: "",
  photoUrl: "",
  photoFit: "cover",
  photoPositionX: 50,
  photoPositionY: 50,
  photoZoom: 1,
  pendingHours: "",
  pendingMinutes: "",
  hourlyRate: "100"
};
const initialPasswordForm = {
  currentPassword: "",
  newPassword: ""
};
const initialPhoneCustomerForm = {
  customerName: "",
  phoneNumber: "",
  photoUrl: "",
  photoFit: "cover",
  photoPositionX: 50,
  photoPositionY: 50,
  photoZoom: 1,
  pendingHours: "",
  pendingMinutes: ""
};
const initialCustomerSummary = {
  totalCustomers: 0,
  totalPendingAmount: 0,
  totalPendingMinutes: 0,
  totalPendingHours: 0,
  customersWithEmail: 0
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });

const getCustomerInitials = (customerName = "") => {
  const cleanedName = customerName.trim();

  if (!cleanedName) {
    return "NA";
  }

  const parts = cleanedName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const getPhotoStyle = (photoFit, photoPositionX, photoPositionY, photoZoom) => {
  const offsetX = ((photoPositionX ?? 50) - 50) * 0.8;
  const offsetY = ((photoPositionY ?? 50) - 50) * 0.8;

  return {
    objectPosition: "center center",
    transform: `translate(${offsetX}%, ${offsetY}%) scale(${photoZoom ?? 1})`,
    transformOrigin: "center"
  };
};

function App() {
  const pageSize = 20;
  const entryToken = useMemo(() => new URLSearchParams(window.location.search).get("entryToken") || "", []);
  const [currentView, setCurrentView] = useState("home");
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    gamerTag: "",
    password: ""
  });
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [editingCustomerId, setEditingCustomerId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerSummary, setCustomerSummary] = useState(initialCustomerSummary);
  const [customerMeta, setCustomerMeta] = useState({
    page: 1,
    totalPages: 1,
    totalCount: 0
  });
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [adminName, setAdminName] = useState("");
  const [systemName, setSystemName] = useState("Gaming Zone");
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [settingsData, setSettingsData] = useState(null);
  const [games, setGames] = useState([]);
  const [gameForm, setGameForm] = useState({ name: "", hourlyRate: "" });
  const [gameLoading, setGameLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [status, setStatus] = useState({
    type: "",
    message: "Use the admin credentials from your server environment settings."
  });
  const [loading, setLoading] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [timeTick, setTimeTick] = useState(Date.now());
  const [entryTokenData, setEntryTokenData] = useState(null);
  const [entryQrUrl, setEntryQrUrl] = useState("");
  const [entryQrImage, setEntryQrImage] = useState("");
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryStatusLoading, setEntryStatusLoading] = useState(false);
  const [publicForm, setPublicForm] = useState(initialPhoneCustomerForm);
  const [publicStatus, setPublicStatus] = useState({
    type: "",
    message: ""
  });
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicEntryData, setPublicEntryData] = useState(null);
  const [publicEntryLoading, setPublicEntryLoading] = useState(Boolean(entryToken));
  const [publicCameraOpen, setPublicCameraOpen] = useState(false);
  const [publicCameraLoading, setPublicCameraLoading] = useState(false);
  const [photoAdjustTarget, setPhotoAdjustTarget] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleCustomerChange = (event) => {
    const { name, value } = event.target;
    setCustomerForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswordForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handlePublicChange = (event) => {
    const { name, value } = event.target;
    setPublicForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handlePublicPhotoChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const photoUrl = await readFileAsDataUrl(file);
      setPublicForm((current) => ({
        ...current,
        photoUrl,
        photoFit: "cover",
        photoPositionX: 50,
        photoPositionY: 50,
        photoZoom: 1
      }));
    } catch (error) {
      setPublicStatus({
        type: "error",
        message: error.message
      });
    }
  };

  const stopPublicCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setPublicCameraOpen(false);
  };

  const openPublicCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPublicStatus({
        type: "error",
        message: "Camera is not supported on this browser."
      });
      return;
    }

    try {
      setPublicCameraLoading(true);
      setPublicStatus({
        type: "",
        message: ""
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });

      streamRef.current = stream;
      setPublicCameraOpen(true);

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (error) {
      setPublicStatus({
        type: "error",
        message: "Unable to open front camera."
      });
    } finally {
      setPublicCameraLoading(false);
    }
  };

  const capturePublicPhoto = () => {
    if (!videoRef.current) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 720;
    canvas.height = videoRef.current.videoHeight || 960;
    const context = canvas.getContext("2d");

    if (!context) {
      setPublicStatus({
        type: "error",
        message: "Unable to capture image."
      });
      return;
    }

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const photoUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPublicForm((current) => ({
      ...current,
      photoUrl,
      photoFit: "cover",
      photoPositionX: 50,
      photoPositionY: 50,
      photoZoom: 1
    }));
    stopPublicCamera();
  };

  const handleCustomerPhotoChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const photoUrl = await readFileAsDataUrl(file);
      setCustomerForm((current) => ({
        ...current,
        photoUrl,
        photoFit: "cover",
        photoPositionX: 50,
        photoPositionY: 50,
        photoZoom: 1
      }));
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    }
  };

  const handleClearPublicPhoto = () => {
    setPublicForm((current) => ({
      ...current,
      photoUrl: "",
      photoFit: "cover",
      photoPositionX: 50,
      photoPositionY: 50,
      photoZoom: 1
    }));
  };

  const handleClearCustomerPhoto = () => {
    setCustomerForm((current) => ({
      ...current,
      photoUrl: "",
      photoFit: "cover",
      photoPositionX: 50,
      photoPositionY: 50,
      photoZoom: 1
    }));
  };

  const handlePublicPhotoFitChange = (photoFit) => {
    setPublicForm((current) => ({
      ...current,
      photoFit
    }));
  };

  const handleCustomerPhotoFitChange = (photoFit) => {
    setCustomerForm((current) => ({
      ...current,
      photoFit
    }));
  };

  const handlePublicPhotoAdjust = (field, value) => {
    setPublicForm((current) => ({
      ...current,
      [field]: Number(value)
    }));
  };

  const handleCustomerPhotoAdjust = (field, value) => {
    setCustomerForm((current) => ({
      ...current,
      [field]: Number(value)
    }));
  };

  const closePhotoAdjustModal = () => {
    setPhotoAdjustTarget("");
  };

  const logout = (message = "Session ended.") => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken("");
    setAdminName("");
    setSystemName("Gaming Zone");
    setLastLoginAt("");
    setCustomers([]);
    setShowCustomerModal(false);
    setCurrentView("home");
    setStatus({
      type: "",
      message
    });
  };

  const getLiveCustomer = (customer) => {
    const bookedTotalMinutes = customer.totalBookedMinutes || customer.totalPendingMinutes || 0;
    const bookedHours = Math.floor(bookedTotalMinutes / 60);
    const bookedMinutes = bookedTotalMinutes % 60;
    const progressPercent = bookedTotalMinutes > 0 ? 0 : 0;

    if (!customer.sessionStartedAt || !bookedTotalMinutes) {
      return {
        ...customer,
        bookedHours,
        bookedMinutes,
        remainingHours: bookedHours,
        remainingMinutes: bookedMinutes,
        remainingTotalMinutes: bookedTotalMinutes,
        sessionExpired: false,
        progressPercent
      };
    }

    const startedAtTime = new Date(customer.sessionStartedAt).getTime();

    if (Number.isNaN(startedAtTime)) {
      return {
        ...customer,
        bookedHours,
        bookedMinutes
      };
    }

    const elapsedMinutes = Math.max(0, Math.floor((timeTick - startedAtTime) / 60000));
    const remainingMinutes = Math.max(0, bookedTotalMinutes - elapsedMinutes);
    const activeProgressPercent =
      bookedTotalMinutes > 0 ? Math.min(100, Math.max(0, (elapsedMinutes / bookedTotalMinutes) * 100)) : 0;

    return {
      ...customer,
      bookedHours,
      bookedMinutes,
      remainingHours: Math.floor(remainingMinutes / 60),
      remainingMinutes: remainingMinutes % 60,
      remainingTotalMinutes: remainingMinutes,
      sessionActive: remainingMinutes > 0,
      sessionExpired: remainingMinutes === 0,
      progressPercent: remainingMinutes === 0 ? 100 : activeProgressPercent
    };
  };

  const liveCustomers = customers.map(getLiveCustomer);
  const totalPages = Math.max(1, customerMeta.totalPages || 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginationWindowStart = Math.max(1, safeCurrentPage - 1);
  const paginationWindowEnd = Math.min(totalPages, paginationWindowStart + 2);
  const pageNumbers = Array.from(
    { length: paginationWindowEnd - paginationWindowStart + 1 },
    (_, index) => paginationWindowStart + index
  );

  const totalPendingAmount = customerSummary.totalPendingAmount || 0;
  const totalPendingHours = Number(customerSummary.totalPendingHours || 0).toFixed(1);

  const formatDateTime = (value) => {
    if (!value) {
      return "Not available";
    }

    return new Date(value).toLocaleString();
  };

  const formatShortDate = (value) => {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatDurationLabel = (totalMinutes) => {
    const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const loadCustomers = async (token, options = {}) => {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      limit: String(options.limit || pageSize),
      search: options.search ?? "",
      filter: options.filter ?? "all",
      startDate: options.startDate ?? "",
      endDate: options.endDate ?? ""
    });
    const response = await fetch(`${API_BASE_URL}/api/customers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load customers.");
    }

    setCustomers(data.customers);
    setCustomerMeta({
      page: data.page,
      totalPages: data.totalPages,
      totalCount: data.totalCount
    });
    setCustomerSummary(data.summary || initialCustomerSummary);
  };

  const loadSettings = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/settings`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load settings.");
    }

    setSettingsData(data);
    setSystemName(data.systemName);
    setLastLoginAt(data.lastLoginAt);
  };

  const loadGames = async (token) => {
    const res = await fetch(`${API_BASE_URL}/api/games`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) setGames(data.games);
  };

  const handleAddGame = async () => {
    if (!gameForm.name || !gameForm.hourlyRate) return;
    setGameLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: gameForm.name, hourlyRate: Number(gameForm.hourlyRate) })
      });
      if (res.ok) {
        setGameForm({ name: "", hourlyRate: "" });
        await loadGames(authToken);
      }
    } finally {
      setGameLoading(false);
    }
  };

  const handleDeleteGame = async (id) => {
    await fetch(`${API_BASE_URL}/api/games/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
    await loadGames(authToken);
  };

  const loadEntryToken = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/entry-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to create QR entry link.");
    }

    const entryUrl = `${window.location.origin}${window.location.pathname}?entryToken=${data.token}`;
    const entryData = {
      ...data,
      entryUrl
    };

    setEntryTokenData(entryData);
    return entryData;
  };

  const loadEntryStatus = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/entry-link/manage`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load scanner status.");
    }

    if (data.isActive && data.token) {
      const entryUrl = `${window.location.origin}${window.location.pathname}?entryToken=${data.token}`;
      setEntryTokenData({
        ...data,
        entryUrl
      });
    } else {
      setEntryTokenData(null);
    }

    return data;
  };

  const validatePublicEntry = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/entry-link?token=${encodeURIComponent(token)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "This QR link is not valid.");
    }

    setPublicEntryData(data);
  };

  useEffect(() => {
    const restoreSession = async () => {
      if (entryToken) {
        setBootstrapping(false);
        return;
      }

      const storedSession = localStorage.getItem(STORAGE_KEY);

      if (!storedSession) {
        setBootstrapping(false);
        return;
      }

      try {
        const parsed = JSON.parse(storedSession);

        if (!parsed.token || !parsed.adminName) {
          throw new Error("Invalid stored session.");
        }

        setAuthToken(parsed.token);
        setAdminName(parsed.adminName);
        setSystemName(parsed.systemName || "Gaming Zone");
        setLastLoginAt(parsed.lastLoginAt || "");
        await loadCustomers(parsed.token, {
          page: 1,
          limit: pageSize,
          search: "",
          filter: "all"
        });
        await loadSettings(parsed.token);
        setStatus({
          type: "success",
          message: "Session restored."
        });
      } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken("");
        setAdminName("");
        setStatus({
          type: "error",
          message: "Previous session expired. Please login again."
        });
      } finally {
        setBootstrapping(false);
      }
    };

    restoreSession();
  }, [entryToken]);

  useEffect(() => {
    if (currentView !== "customers") {
      return;
    }

    setCurrentPage(1);
  }, [customerFilter, statusFilter, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setTimeTick(now);

      // fire times-up notification for any session that just expired
      customers.forEach((customer) => {
        if (!customer.sessionStartedAt || !customer.totalBookedMinutes || customer.timesUpNotifiedAt) return;
        const elapsed = Math.floor((now - new Date(customer.sessionStartedAt).getTime()) / 60000);
        if (elapsed >= customer.totalBookedMinutes) {
          fetch(`${API_BASE_URL}/api/customers/${customer._id}/notify-timesup`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}` }
          }).catch(() => {});
        }
      });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [authToken, customers]);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      try {
        await loadCustomers(authToken, {
          page: currentView === "customers" ? currentPage : 1,
          limit: pageSize,
          search: currentView === "customers" ? customerFilter : "",
          filter: currentView === "customers" ? statusFilter : "all",
          startDate: currentView === "customers" ? startDateFilter : "",
          endDate: currentView === "customers" ? endDateFilter : ""
        });
      } catch (error) {
        setStatus((current) =>
          current.type === "error"
            ? current
            : {
                type: "error",
                message: error.message
              }
        );
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [authToken, currentView, currentPage, customerFilter, statusFilter, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (!authToken || currentView !== "customers") {
      return;
    }

    loadCustomers(authToken, {
      page: currentPage,
      limit: pageSize,
      search: customerFilter,
      filter: statusFilter,
      startDate: startDateFilter,
      endDate: endDateFilter
    }).catch((error) => {
      setStatus({
        type: "error",
        message: error.message
      });
    });
  }, [authToken, currentView, currentPage, customerFilter, statusFilter, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (!authToken) {
      setEntryTokenData(null);
      setEntryQrUrl("");
      setEntryQrImage("");
      return;
    }

    const syncEntryStatus = async () => {
      try {
        setEntryStatusLoading(true);
        const data = await loadEntryStatus(authToken);

        if (!data.isActive) {
          setEntryTokenData(null);
          setEntryQrUrl("");
          setEntryQrImage("");
        }
      } catch (error) {
        setStatus({
          type: "error",
          message: error.message
        });
      } finally {
        setEntryStatusLoading(false);
      }
    };

    syncEntryStatus();
  }, [authToken]);

  useEffect(() => {
    if (!entryTokenData?.entryUrl) {
      return;
    }

    setEntryQrUrl(entryTokenData.entryUrl);
    QRCode.toDataURL(entryTokenData.entryUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#f2eee8",
        light: "#15161b"
      }
    })
      .then(setEntryQrImage)
      .catch(() => setEntryQrImage(""));
  }, [entryTokenData]);

  useEffect(() => {
    if (!entryToken) {
      setPublicEntryLoading(false);
      return;
    }

    const checkEntry = async () => {
      try {
        setPublicEntryLoading(true);
        await validatePublicEntry(entryToken);
        setPublicStatus({
          type: "",
          message: ""
        });
      } catch (error) {
        setPublicStatus({
          type: "error",
          message: error.message
        });
      } finally {
        setPublicEntryLoading(false);
      }
    };

    checkEntry();
  }, [entryToken]);

  useEffect(() => () => stopPublicCamera(), []);

  // listen for foreground FCM messages — show system notification even when tab is open
  useEffect(() => {
    const unsubscribe = onForegroundMessage(({ title, body, data }) => {
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/vite.svg", data });
      }
      const id = Date.now();
      setToasts((prev) => [...prev, { id, title, body }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 10 * 60 * 1000);
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setStatus({ type: "", message: "Authenticating..." });

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      setAuthToken(data.token);
      setAdminName(data.user.gamerTag);
      setSystemName(data.settings.systemName);
      setLastLoginAt(data.user.lastLoginAt);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: data.token,
          adminName: data.user.gamerTag,
          systemName: data.settings.systemName,
          lastLoginAt: data.user.lastLoginAt
        })
      );
      await loadCustomers(data.token, {
        page: 1,
        limit: pageSize,
        search: "",
        filter: "all"
      });
      await Promise.all([loadSettings(data.token), loadGames(data.token)]);

      // silently register FCM token in background — no UI feedback
      requestFcmToken(data.token)
        .then((fcmToken) =>
          fetch(`${API_BASE_URL}/api/auth/fcm-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
            body: JSON.stringify({ fcmToken })
          })
        )
        .catch(() => {});

      loadNotifications(data.token);

      setStatus({
        type: "success",
        message: `Welcome back, ${data.user.gamerTag}. Session saved for 1 day.`
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async (token) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {}
  };

  const handleOpenNotifications = async () => {
    await loadNotifications(authToken);
    setCurrentView("notifications");
    // mark all read after opening
    fetch(`${API_BASE_URL}/api/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${authToken}` }
    }).then(() => setUnreadCount(0)).catch(() => {});
  };

  const handleOpenSettings = async () => {
    try {
      setSettingsLoading(true);
      await Promise.all([loadSettings(authToken), loadGames(authToken)]);
      setCurrentView("settings");
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    try {
      setPasswordLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(passwordForm)
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout("Session expired. Please login again.");
          return;
        }

        throw new Error(data.message || "Unable to change password.");
      }

      setPasswordForm(initialPasswordForm);
      setStatus({
        type: "success",
        message: data.message
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCustomerSubmit = async (event) => {
    event.preventDefault();

    try {
      setCustomerLoading(true);
      setStatus({
        type: "",
        message: "Saving customer..."
      });

      const response = await fetch(
        editingCustomerId ? `${API_BASE_URL}/api/customers/${editingCustomerId}` : `${API_BASE_URL}/api/customers`,
        {
          method: editingCustomerId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          customerName: customerForm.customerName,
          phoneNumber: customerForm.phoneNumber,
          email: customerForm.email,
          photoUrl: customerForm.photoUrl,
          photoFit: customerForm.photoFit,
          photoPositionX: customerForm.photoPositionX,
          photoPositionY: customerForm.photoPositionY,
          photoZoom: customerForm.photoZoom,
          pendingHours: customerForm.pendingHours,
          pendingMinutes: customerForm.pendingMinutes,
          hourlyRate: customerForm.hourlyRate
        })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout("Session expired. Please login again.");
          return;
        }
        throw new Error(data.message || "Unable to save customer.");
      }

      await loadCustomers(authToken, {
        page: currentView === "customers" ? currentPage : 1,
        limit: pageSize,
        search: currentView === "customers" ? customerFilter : "",
        filter: currentView === "customers" ? statusFilter : "all",
        startDate: currentView === "customers" ? startDateFilter : "",
        endDate: currentView === "customers" ? endDateFilter : ""
      });
      setCustomerForm(initialCustomerForm);
      setShowCustomerModal(false);
      setEditingCustomerId("");
      setStatus({
        type: "success",
        message: editingCustomerId ? "Customer updated successfully." : `${data.customer.customerName} added successfully.`
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setCustomerLoading(false);
    }
  };

  const handlePublicSubmit = async (event) => {
    event.preventDefault();

    try {
      setPublicLoading(true);
      setPublicStatus({
        type: "",
        message: "Saving request..."
      });

      const response = await fetch(`${API_BASE_URL}/api/customers/public`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: entryToken,
          customerName: publicForm.customerName,
          phoneNumber: publicForm.phoneNumber,
          photoUrl: publicForm.photoUrl,
          photoFit: publicForm.photoFit,
          photoPositionX: publicForm.photoPositionX,
          photoPositionY: publicForm.photoPositionY,
          photoZoom: publicForm.photoZoom,
          pendingHours: publicForm.pendingHours,
          pendingMinutes: publicForm.pendingMinutes
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to add customer.");
      }

      setPublicForm(initialPhoneCustomerForm);
      setPublicStatus({
        type: "success",
        message: `${data.customer.customerName} added in pending state.`
      });
    } catch (error) {
      setPublicStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setPublicLoading(false);
    }
  };

  const handleActivateCustomer = async (customerId) => {
    try {
      setStatus({
        type: "",
        message: "Starting timer..."
      });

      const response = await fetch(`${API_BASE_URL}/api/customers/${customerId}/activate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout("Session expired. Please login again.");
          return;
        }

        throw new Error(data.message || "Unable to activate customer.");
      }

      setCustomers((current) =>
        current.map((customer) => (customer._id === customerId ? data.customer : customer))
      );
      setStatus({
        type: "success",
        message: data.message
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    }
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomerId(customer._id);
    setCustomerForm({
      customerName: customer.customerName || "",
      phoneNumber: customer.phoneNumber || "",
      email: customer.email || "",
      photoUrl: customer.photoUrl || "",
      photoFit: customer.photoFit || "cover",
      photoPositionX: Number(customer.photoPositionX ?? 50),
      photoPositionY: Number(customer.photoPositionY ?? 50),
      photoZoom: Number(customer.photoZoom ?? 1),
      pendingHours: String(customer.bookedHours ?? customer.pendingHours ?? 0),
      pendingMinutes: String(customer.bookedMinutes ?? customer.pendingMinutes ?? 0),
      hourlyRate: String(customer.hourlyRate ?? 100)
    });
    setShowCustomerModal(true);
  };

  const handleOpenNewCustomerModal = () => {
    setEditingCustomerId("");
    setCustomerForm(initialCustomerForm);
    setShowCustomerModal(true);
  };

  const handleExportCustomers = async () => {
    try {
      setStatus({
        type: "",
        message: "Preparing Excel..."
      });

      const params = new URLSearchParams({
        search: customerFilter,
        filter: statusFilter,
        startDate: startDateFilter,
        endDate: endDateFilter
      });
      const response = await fetch(`${API_BASE_URL}/api/customers/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to export customers.");
      }

      const rows = data.customers.map((customer) => ({
        Name: customer.customerName,
        Phone: customer.phoneNumber,
        "Added Date": formatShortDate(customer.createdAt),
        "Booked Time": formatDurationLabel(customer.totalBookedMinutes ?? customer.totalPendingMinutes),
        "Time Spent": formatDurationLabel(customer.spentTotalMinutes),
        "Time Left": customer.sessionExpired
          ? "Times up"
          : customer.sessionPending
            ? "Not started"
            : formatDurationLabel(customer.remainingTotalMinutes),
        Status: customer.sessionExpired ? "Times up" : customer.sessionActive ? "Active" : "Pending",
        "Hourly Rate": customer.hourlyRate,
        Amount: customer.pendingCost
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
      XLSX.writeFile(workbook, `customers-${new Date().toISOString().slice(0, 10)}.xlsx`);

      setStatus({
        type: "success",
        message: `Excel downloaded with ${rows.length} entries.`
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    }
  };

  const handleGenerateScanner = async () => {
    try {
      setEntryLoading(true);
      const data = await loadEntryToken(authToken);
      setStatus({
        type: "success",
        message: "New scanner generated. Old scanner expired."
      });
      return data;
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
      return null;
    } finally {
      setEntryLoading(false);
    }
  };

  const handleCloseScanner = async () => {
    try {
      setEntryLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/entry-link`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to close scanner.");
      }

      setEntryTokenData(null);
      setEntryQrUrl("");
      setEntryQrImage("");
      setStatus({
        type: "success",
        message: data.message
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setEntryLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <main className="login-shell">
        <section className="login-panel login-panel-centered">
          <p className="section-kicker">Gaming Zone</p>
          <h1>Loading session...</h1>
        </section>
      </main>
    );
  }

  if (entryToken && !authToken) {
    return (
      <main className="login-shell phone-entry-shell">
        <section className="login-panel phone-entry-panel">
          <div>
            <p className="section-kicker">{publicEntryData?.systemName || "Gaming Zone"}</p>
            <h1>Quick Customer Entry</h1>
            <p className="section-copy">
              Add name, phone, photo, and pending time. This link stays valid for 1 day.
            </p>
          </div>

          {publicEntryLoading ? (
            <p className="status-message">Checking QR link...</p>
          ) : (
            <form onSubmit={handlePublicSubmit} className="login-form light-form">
              <label>
                Customer Name
                <input
                  name="customerName"
                  type="text"
                  placeholder="Enter customer name"
                  value={publicForm.customerName}
                  onChange={handlePublicChange}
                />
              </label>

              <label>
                Phone Number
                <input
                  name="phoneNumber"
                  type="text"
                  placeholder="Enter phone number"
                  value={publicForm.phoneNumber}
                  onChange={handlePublicChange}
                />
              </label>

              <div className="photo-upload-block">
                <span className="photo-upload-label">Photo</span>
                <div className="photo-upload-actions">
                  <label className="ghost-button photo-upload-button">
                    {publicForm.photoUrl ? "Change Photo" : "Upload Photo"}
                    <input
                      className="sr-only-file-input"
                      name="photo"
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handlePublicPhotoChange}
                    />
                  </label>
                  {publicForm.photoUrl ? (
                    <button type="button" className="ghost-button" onClick={handleClearPublicPhoto}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="camera-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={openPublicCamera}
                  disabled={publicCameraLoading}
                >
                  {publicCameraLoading ? "Opening Camera..." : "Take Face Photo"}
                </button>
                {publicCameraOpen ? (
                  <button type="button" className="ghost-button" onClick={stopPublicCamera}>
                    Close Camera
                  </button>
                ) : null}
              </div>

              {publicCameraOpen ? (
                <div className="camera-card">
                  <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
                  <button type="button" className="primary-button" onClick={capturePublicPhoto}>
                    Capture Photo
                  </button>
                </div>
              ) : null}

              {publicForm.photoUrl ? (
                <>
                  <button
                    type="button"
                    className="photo-preview-card photo-preview-button"
                    onClick={() => setPhotoAdjustTarget("public")}
                  >
                    <img
                      className={`photo-preview ${publicForm.photoFit === "contain" ? "photo-preview-fit" : ""}`}
                      src={publicForm.photoUrl}
                      alt="Customer preview"
                      style={getPhotoStyle(
                        publicForm.photoFit,
                        publicForm.photoPositionX,
                        publicForm.photoPositionY,
                        publicForm.photoZoom
                      )}
                    />
                  </button>
                  <p className="field-hint">Click image to adjust inside popup.</p>
                </>
              ) : null}

              <div className="time-grid">
                <label>
                  Pending Hours
                  <input
                    name="pendingHours"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={publicForm.pendingHours}
                    onChange={handlePublicChange}
                  />
                </label>

                <label>
                  Pending Minutes
                  <input
                    name="pendingMinutes"
                    type="number"
                    min="0"
                    max="59"
                    placeholder="30"
                    value={publicForm.pendingMinutes}
                    onChange={handlePublicChange}
                  />
                </label>
              </div>

              <button type="submit" disabled={publicLoading || Boolean(publicStatus.type === "error" && !publicEntryData)}>
                {publicLoading ? "Saving..." : "Add Customer"}
              </button>
            </form>
          )}

          <p className={`status-message ${publicStatus.type}`}>{publicStatus.message}</p>
          {publicEntryData?.expiresAt ? (
            <p className="entry-expiry">Valid till {formatDateTime(publicEntryData.expiresAt)}</p>
          ) : null}
        </section>
      </main>
    );
  }

  if (authToken) {
    return (
      <main className="dashboard-shell">
        {toasts.length > 0 && (
          <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", maxWidth: "300px" }}>
            {toasts.map((t) => (
              <div key={t.id} style={{ background: "#23233a", border: "1px solid #6c63ff55", borderLeft: "4px solid #6c63ff", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                  <strong style={{ color: "#c9b8ff", fontSize: "0.95rem" }}>🔔 {t.title}</strong>
                  <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>✕</button>
                </div>
                <span style={{ fontSize: "0.85rem", color: "#ccc" }}>{t.body}</span>
              </div>
            ))}
          </div>
        )}
        <aside className="sidebar-card">
          <div className="sidebar-brand">
            <p className="card-label">Gaming Zone</p>
            <h2>Admin Panel</h2>
            <span>{adminName}</span>
          </div>

          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-link ${currentView === "home" ? "active-link" : ""}`}
              onClick={() => setCurrentView("home")}
            >
              <span className="sidebar-icon">⌂</span>
              <span>Home</span>
            </button>
            <button
              type="button"
              className={`sidebar-link ${currentView === "customers" ? "active-link" : ""}`}
              onClick={() => setCurrentView("customers")}
            >
              <span className="sidebar-icon">☰</span>
              Customers
            </button>
            <button
              type="button"
              className={`sidebar-link ${currentView === "notifications" ? "active-link" : ""}`}
              onClick={handleOpenNotifications}
            >
              <span className="sidebar-icon">🔔</span>
              <span className="sidebar-notif-label">
                Notifications
                {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </span>
            </button>
            <button
              type="button"
              className={`sidebar-link ${currentView === "settings" ? "active-link" : ""}`}
              onClick={handleOpenSettings}
              disabled={settingsLoading}
            >
              <span className="sidebar-icon">⚙</span>
              {settingsLoading ? "Loading..." : "Settings"}
            </button>
          </nav>

          <div className="sidebar-footer">
            <button type="button" className="danger-button" onClick={() => logout("Logged out successfully.")}>
              Logout
            </button>
          </div>
        </aside>

        {/* ── mobile bottom navigation bar (hidden on ≥481px via CSS) ── */}
        <nav className="mobile-nav">
          <button
            type="button"
            className={`mobile-nav-btn ${currentView === "home" ? "mobile-nav-active" : ""}`}
            onClick={() => setCurrentView("home")}
          >
            <span className="mobile-nav-icon">⌂</span>
            <span className="mobile-nav-label">Home</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${currentView === "customers" ? "mobile-nav-active" : ""}`}
            onClick={() => setCurrentView("customers")}
          >
            <span className="mobile-nav-icon">☰</span>
            <span className="mobile-nav-label">Customers</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${currentView === "notifications" ? "mobile-nav-active" : ""}`}
            onClick={handleOpenNotifications}
          >
            <span className="mobile-nav-icon">
              🔔{unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </span>
            <span className="mobile-nav-label">Alerts</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${currentView === "settings" ? "mobile-nav-active" : ""}`}
            onClick={handleOpenSettings}
            disabled={settingsLoading}
          >
            <span className="mobile-nav-icon">⚙</span>
            <span className="mobile-nav-label">Settings</span>
          </button>
          <button
            type="button"
            className="mobile-nav-btn mobile-nav-logout"
            onClick={() => logout("Logged out successfully.")}
          >
            <span className="mobile-nav-icon">⏻</span>
            <span className="mobile-nav-label">Logout</span>
          </button>
        </nav>

        <section className="dashboard-main">
          {currentView === "home" ? (
            <>
              <section className="stats-grid stats-grid-top">
                <article className="stat-card">
                  <p>Total clients</p>
                  <h2>{customers.length}</h2>
                </article>
                <article className="stat-card">
                  <p>System name</p>
                  <h2>{systemName}</h2>
                  <span>Sessions are tracked for 1 day</span>
                </article>
                <article className="stat-card">
                  <p>Login time</p>
                  <h2>{lastLoginAt ? new Date(lastLoginAt).toLocaleTimeString() : "--:--"}</h2>
                  <span>{formatDateTime(lastLoginAt)}</span>
                </article>
                <article className="stat-card">
                  <p>Pending amount</p>
                  <h2>INR {totalPendingAmount.toFixed(2)}</h2>
                  <span>{totalPendingHours} total pending hours</span>
                </article>
              </section>

              <section className="table-card qr-panel">
                <div className="table-heading">
                  <div>
                    <p className="card-label">Phone Entry</p>
                    <h2>QR Code</h2>
                  </div>
                  <div className="qr-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleGenerateScanner}
                      disabled={entryLoading || entryStatusLoading}
                    >
                      {entryLoading ? "Generating..." : "Generate"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleCloseScanner}
                      disabled={entryLoading || entryStatusLoading || !entryTokenData?.isActive}
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="qr-grid">
                  <div className="qr-preview-box">
                    {entryLoading || entryStatusLoading ? (
                      <p className="status-message">Preparing scanner...</p>
                    ) : entryTokenData?.isActive && entryQrImage ? (
                      <img className="qr-image" src={entryQrImage} alt="Customer entry QR code" />
                    ) : (
                      <p className="status-message">No active scanner.</p>
                    )}
                  </div>

                  <div className="qr-copy-block">
                    <p className="qr-copy-title">
                      {entryTokenData?.isActive ? "Scan on phone" : "Scanner closed"}
                    </p>
                    <p className="qr-copy-text">
                      Only one scanner stays active at a time. Generating a new one expires the old one immediately.
                    </p>
                    <p className="entry-expiry">
                      {entryTokenData?.isActive
                        ? `Valid till ${entryTokenData?.expiresAt ? formatDateTime(entryTokenData.expiresAt) : "Loading..."}`
                        : "Create a new scanner when you want phone entry."}
                    </p>
                    {entryTokenData?.isActive && entryQrUrl ? (
                      <a className="qr-link" href={entryQrUrl} target="_blank" rel="noreferrer">
                        Open entry page
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="qr-status-row">
                  <p className={`status-message ${status.type}`}>{status.message}</p>
                </div>
              </section>
            </>
          ) : null}

          {currentView === "customers" ? (
            <>
              <section className="dashboard-header compact-toolbar">
                <div className="dashboard-toolbar toolbar-only">
                  <div className="toolbar-field">
                    <input
                      type="text"
                      placeholder="Search customers"
                      value={customerFilter}
                      onChange={(event) => setCustomerFilter(event.target.value)}
                    />
                  </div>

                  <div className="toolbar-date-range">
                    <input
                      type="date"
                      value={startDateFilter}
                      onChange={(event) => setStartDateFilter(event.target.value)}
                    />
                    <span className="toolbar-date-sep">→</span>
                    <input
                      type="date"
                      value={endDateFilter}
                      onChange={(event) => setEndDateFilter(event.target.value)}
                    />
                  </div>

                  {(customerFilter || startDateFilter || endDateFilter) ? (
                    <button
                      type="button"
                      className="ghost-button toolbar-clear-btn"
                      onClick={() => {
                        setCustomerFilter("");
                        setStartDateFilter("");
                        setEndDateFilter("");
                        setStatusFilter("all");
                      }}
                    >
                      ✕ Clear
                    </button>
                  ) : null}

                  <button type="button" className="primary-button" onClick={handleOpenNewCustomerModal}>
                    + Add Customer
                  </button>

                  <button type="button" className="ghost-button" onClick={handleExportCustomers}>
                    Download Excel
                  </button>
                </div>
              </section>

              <section className="table-card">
                <div className="table-heading">
                  <div>
                    <h2>Customer List <button className="icon-btn" title="Refresh" onClick={() => loadCustomers(authToken, { page: currentPage, limit: pageSize, search: customerFilter, filter: statusFilter, startDate: startDateFilter, endDate: endDateFilter })}>↻</button></h2>
                    <p className="table-count-copy">{customerMeta.totalCount} entries</p>
                  </div>
                  <p className={`status-message ${status.type}`}>{status.message}</p>
                </div>

                <div className="table-wrapper customer-table-wrapper">
                  <div className="table-row table-head">
                    <span>Client</span>
                    <span>Phone</span>
                    <span>Added Date</span>
                    <span>Pending Time</span>
                    <span>Time Left</span>
                    <span>Status</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span>Action</span>
                  </div>

                  {liveCustomers.length === 0 ? (
                    <div className="empty-table">No customers found.</div>
                  ) : (
                    liveCustomers.map((customer) => (
                      <div className="table-row customer-table-row" key={customer._id}>
                        <span className="client-cell">
                          {customer.photoUrl ? (
                            <span className="client-avatar-frame">
                              <img
                                className={`client-avatar ${customer.photoFit === "contain" ? "client-avatar-fit" : ""}`}
                                src={customer.photoUrl}
                                alt={customer.customerName}
                                style={getPhotoStyle(
                                  customer.photoFit,
                                  customer.photoPositionX,
                                  customer.photoPositionY,
                                  customer.photoZoom
                                )}
                              />
                            </span>
                          ) : (
                            <span className="client-avatar-frame client-avatar-fallback">
                              {getCustomerInitials(customer.customerName)}
                            </span>
                          )}
                          <strong>{customer.customerName}</strong>
                        </span>
                        <span>{customer.phoneNumber}</span>
                        <span>{formatShortDate(customer.createdAt)}</span>
                        <span>
                          {customer.bookedHours ?? customer.pendingHours}h {customer.bookedMinutes ?? customer.pendingMinutes}m
                        </span>
                        <span className={customer.sessionExpired ? "time-status time-status-expired" : "time-status"}>
                          {customer.sessionExpired ? (
                            <>
                              <span className="timesup-bell" title="Time's up notification sent">🔔</span>
                              {" "}Times up
                            </>
                          ) : customer.sessionPending
                            ? "Not started"
                            : `${customer.remainingHours ?? customer.pendingHours}h ${customer.remainingMinutes ?? customer.pendingMinutes}m left`}
                        </span>
                        <span>
                          <span
                            className={`status-pill ${
                              customer.sessionExpired
                                ? "status-pill-expired"
                                : customer.sessionActive
                                  ? "status-pill-active"
                                  : "status-pill-pending"
                            }`}
                          >
                            {customer.sessionExpired ? "Times up" : customer.sessionActive ? "Active" : "Pending"}
                          </span>
                        </span>
                        <span>INR {customer.hourlyRate}/hr</span>
                        <span className="amount-cell">INR {customer.pendingCost}</span>
                        <span>
                          {customer.sessionPending ? (
                            <div className="table-action-group">
                              <button
                                type="button"
                                className="table-action-button"
                                onClick={() => handleActivateCustomer(customer._id)}
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                className="table-edit-button"
                                onClick={() => handleEditCustomer(customer)}
                              >
                                Edit
                              </button>
                            </div>
                          ) : customer.sessionActive ? (
                            <div className="table-action-group">
                              <span
                                className="table-action-label table-action-label-active"
                                style={{ "--fill-percent": `${customer.progressPercent || 0}%` }}
                              >
                                Running
                              </span>
                              <button
                                type="button"
                                className="table-edit-button"
                                onClick={() => handleEditCustomer(customer)}
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <div className="table-action-group">
                              <span className="table-action-label table-action-label-expired">Times up</span>
                              <button
                                type="button"
                                className="table-edit-button"
                                onClick={() => handleEditCustomer(customer)}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {customerMeta.totalCount > 0 ? (
                  <div className="pagination-bar">
                    <p className="pagination-copy">
                      Page {safeCurrentPage} of {totalPages}
                    </p>
                    <div className="pagination-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      {pageNumbers[0] > 1 ? (
                        <button type="button" className="page-chip" onClick={() => setCurrentPage(1)}>
                          1
                        </button>
                      ) : null}
                      {pageNumbers[0] > 2 ? <span className="pagination-dots">...</span> : null}
                      {pageNumbers.map((pageNumber) => (
                        <button
                          key={pageNumber}
                          type="button"
                          className={`page-chip ${pageNumber === safeCurrentPage ? "page-chip-active" : ""}`}
                          onClick={() => setCurrentPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                      {pageNumbers[pageNumbers.length - 1] < totalPages - 1 ? (
                        <span className="pagination-dots">...</span>
                      ) : null}
                      {pageNumbers[pageNumbers.length - 1] < totalPages ? (
                        <button type="button" className="page-chip" onClick={() => setCurrentPage(totalPages)}>
                          {totalPages}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {currentView === "settings" ? (
            <section className="table-card settings-page">
              <div className="table-heading">
                <div>
                  <p className="card-label">Settings</p>
                  <h2>System & Login</h2>
                </div>
                <p className={`status-message ${status.type}`}>{status.message}</p>
              </div>

              <div className="settings-grid settings-page-grid">
                <article className="settings-box">
                  <span>System Name</span>
                  <strong>{settingsData?.systemName || systemName}</strong>
                </article>
                <article className="settings-box">
                  <span>Admin Name</span>
                  <strong>{settingsData?.adminName || adminName}</strong>
                </article>
                <article className="settings-box">
                  <span>Current Time</span>
                  <strong>{formatDateTime(settingsData?.currentTime)}</strong>
                </article>
                <article className="settings-box">
                  <span>Login Time</span>
                  <strong>{formatDateTime(settingsData?.lastLoginAt || lastLoginAt)}</strong>
                </article>
                <article className="settings-box">
                  <span>Active Sessions</span>
                  <strong>{settingsData?.activeSessionCount || 0}</strong>
                </article>
              </div>

              <form onSubmit={handlePasswordSubmit} className="login-form settings-form settings-page-form">
                <h3>Change Password</h3>
                <label>
                  Current Password
                  <input
                    name="currentPassword"
                    type="password"
                    placeholder="Enter current password"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordChange}
                  />
                </label>

                <label>
                  New Password
                  <input
                    name="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                  />
                </label>

                <div className="settings-actions">
                  <button type="submit" className="primary-button" disabled={passwordLoading}>
                    {passwordLoading ? "Updating..." : "Change Password"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {currentView === "settings" ? (
            <section className="table-card settings-page">
              <div className="table-heading">
                <div>
                  <p className="card-label">Master Data</p>
                  <h2>Games & Rates</h2>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
                <input
                  className="input-field"
                  placeholder="Game name"
                  value={gameForm.name}
                  onChange={(e) => setGameForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ flex: 1, minWidth: "140px" }}
                />
                <input
                  className="input-field"
                  placeholder="Hourly rate (₹)"
                  type="number"
                  min="0"
                  value={gameForm.hourlyRate}
                  onChange={(e) => setGameForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                  style={{ width: "160px" }}
                />
                <button className="primary-button" onClick={handleAddGame} disabled={gameLoading || !gameForm.name || !gameForm.hourlyRate}>
                  {gameLoading ? "Adding..." : "+ Add Game"}
                </button>
              </div>
              {games.length === 0 ? (
                <p style={{ color: "#888", fontSize: "0.9rem" }}>No games added yet.</p>
              ) : (
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Hourly Rate</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g._id}>
                        <td>{g.name}</td>
                        <td>₹{g.hourlyRate}/hr</td>
                        <td>
                          <button className="danger-button" onClick={() => handleDeleteGame(g._id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}

          {currentView === "notifications" ? (
            <section className="table-card settings-page">
              <div className="table-heading">
                <div>
                  <p className="card-label">Alerts</p>
                  <h2>Notifications</h2>
                </div>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <p className="notif-empty">No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n._id} className={`notif-item ${n.isRead ? "notif-read" : "notif-unread"}`}>
                      <span className="notif-icon">{n.type === "timesup" ? "⏰" : "🎮"}</span>
                      <div className="notif-body">
                        <p className="notif-title">{n.title}</p>
                        <p className="notif-text">{n.body}</p>
                        <p className="notif-time">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </section>

        {showCustomerModal ? (
          <div
            className="modal-backdrop"
            onClick={() => {
              setShowCustomerModal(false);
              setEditingCustomerId("");
              setCustomerForm(initialCustomerForm);
            }}
          >
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p className="card-label">Add Customer</p>
                  <h2>{editingCustomerId ? "Edit customer" : "New entry"}</h2>
                </div>
                <button
                  type="button"
                  className="close-button"
                  onClick={() => {
                    setShowCustomerModal(false);
                    setEditingCustomerId("");
                    setCustomerForm(initialCustomerForm);
                  }}
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleCustomerSubmit} className="login-form">
                <label>
                  Customer Name
                  <input
                    name="customerName"
                    type="text"
                    placeholder="Enter customer name"
                    value={customerForm.customerName}
                    onChange={handleCustomerChange}
                  />
                </label>

                <label>
                  Phone Number
                  <input
                    name="phoneNumber"
                    type="text"
                    placeholder="Enter phone number"
                    value={customerForm.phoneNumber}
                    onChange={handleCustomerChange}
                  />
                </label>

                <label>
                  Email ID
                  <input
                    name="email"
                    type="email"
                    placeholder="Optional email"
                    value={customerForm.email}
                    onChange={handleCustomerChange}
                  />
                </label>

                <div className="photo-upload-block">
                  <span className="photo-upload-label">Photo</span>
                  <div className="photo-upload-actions">
                    <label className="ghost-button photo-upload-button">
                      {customerForm.photoUrl ? "Change Photo" : "Upload Photo"}
                      <input
                        className="sr-only-file-input"
                        name="photo"
                        type="file"
                        accept="image/*"
                        onChange={handleCustomerPhotoChange}
                      />
                    </label>
                    {customerForm.photoUrl ? (
                      <button type="button" className="ghost-button" onClick={handleClearCustomerPhoto}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                {customerForm.photoUrl ? (
                  <>
                    <button
                      type="button"
                      className="photo-preview-card photo-preview-button"
                      onClick={() => setPhotoAdjustTarget("customer")}
                    >
                      <img
                        className={`photo-preview ${customerForm.photoFit === "contain" ? "photo-preview-fit" : ""}`}
                        src={customerForm.photoUrl}
                        alt="Customer preview"
                        style={getPhotoStyle(
                          customerForm.photoFit,
                          customerForm.photoPositionX,
                          customerForm.photoPositionY,
                          customerForm.photoZoom
                        )}
                      />
                    </button>
                    <p className="field-hint">Click image to adjust inside popup.</p>
                  </>
                ) : null}

                <div className="time-grid">
                  <label>
                    Play Hours
                    <input
                      name="pendingHours"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={customerForm.pendingHours}
                      onChange={handleCustomerChange}
                    />
                  </label>

                  <label>
                    Play Minutes
                    <input
                      name="pendingMinutes"
                      type="number"
                      min="0"
                      max="59"
                      placeholder="30"
                      value={customerForm.pendingMinutes}
                      onChange={handleCustomerChange}
                    />
                  </label>
                </div>

                <p className="field-hint">
                  {editingCustomerId
                    ? "Update customer details and booked time here."
                    : "New customers stay pending first. Timer starts only when you click Activate in the customer list."}
                </p>

                {games.length > 0 && (
                  <label>
                    Select Game
                    <select
                      onChange={(e) => {
                        const g = games.find((x) => x._id === e.target.value);
                        if (g) setCustomerForm((f) => ({ ...f, hourlyRate: String(g.hourlyRate) }));
                      }}
                      defaultValue=""
                    >
                      <option value="">-- Pick a game --</option>
                      {games.map((g) => (
                        <option key={g._id} value={g._id}>{g.name} — ₹{g.hourlyRate}/hr</option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  Cost Per Hour
                  <input
                    name="hourlyRate"
                    type="number"
                    min="0"
                    placeholder="100"
                    value={customerForm.hourlyRate}
                    onChange={handleCustomerChange}
                  />
                </label>

                <button type="submit" disabled={customerLoading}>
                  {customerLoading ? "Saving..." : editingCustomerId ? "Update Customer" : "Save Customer"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {photoAdjustTarget ? (
          <div className="modal-backdrop" onClick={closePhotoAdjustModal}>
            <div className="modal-card photo-adjust-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p className="card-label">Adjust Photo</p>
                  <h2>Position Image</h2>
                </div>
                <button type="button" className="close-button" onClick={closePhotoAdjustModal}>
                  Close
                </button>
              </div>

              {photoAdjustTarget === "public" && publicForm.photoUrl ? (
                <div className="photo-adjust-modal-body">
                  <div className="photo-preview-card photo-preview-card-large">
                    <img
                      className={`photo-preview ${publicForm.photoFit === "contain" ? "photo-preview-fit" : ""}`}
                      src={publicForm.photoUrl}
                      alt="Customer preview"
                      style={getPhotoStyle(
                        publicForm.photoFit,
                        publicForm.photoPositionX,
                        publicForm.photoPositionY,
                        publicForm.photoZoom
                      )}
                    />
                  </div>
                  <div className="photo-adjust-grid photo-adjust-grid-wide">
                    <label>
                      Move Left / Right
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={publicForm.photoPositionX}
                        onChange={(event) => handlePublicPhotoAdjust("photoPositionX", event.target.value)}
                      />
                    </label>
                    <label>
                      Move Up / Down
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={publicForm.photoPositionY}
                        onChange={(event) => handlePublicPhotoAdjust("photoPositionY", event.target.value)}
                      />
                    </label>
                    <label>
                      Zoom In / Out
                      <input
                        type="range"
                        min="1"
                        max="2.5"
                        step="0.05"
                        value={publicForm.photoZoom}
                        onChange={(event) => handlePublicPhotoAdjust("photoZoom", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {photoAdjustTarget === "customer" && customerForm.photoUrl ? (
                <div className="photo-adjust-modal-body">
                  <div className="photo-preview-card photo-preview-card-large">
                    <img
                      className={`photo-preview ${customerForm.photoFit === "contain" ? "photo-preview-fit" : ""}`}
                      src={customerForm.photoUrl}
                      alt="Customer preview"
                      style={getPhotoStyle(
                        customerForm.photoFit,
                        customerForm.photoPositionX,
                        customerForm.photoPositionY,
                        customerForm.photoZoom
                      )}
                    />
                  </div>
                  <div className="photo-adjust-grid photo-adjust-grid-wide">
                    <label>
                      Move Left / Right
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={customerForm.photoPositionX}
                        onChange={(event) => handleCustomerPhotoAdjust("photoPositionX", event.target.value)}
                      />
                    </label>
                    <label>
                      Move Up / Down
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={customerForm.photoPositionY}
                        onChange={(event) => handleCustomerPhotoAdjust("photoPositionY", event.target.value)}
                      />
                    </label>
                    <label>
                      Zoom In / Out
                      <input
                        type="range"
                        min="1"
                        max="2.5"
                        step="0.05"
                        value={customerForm.photoZoom}
                        onChange={(event) => handleCustomerPhotoAdjust("photoZoom", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div>
          <p className="section-kicker">Gaming Zone</p>
          <h1>Admin Login</h1>
          <p className="section-copy">Multiple logins are allowed. Each session expires automatically after 1 day.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form light-form">
          <label>
            Username
            <input
              name="gamerTag"
              type="text"
              placeholder="Enter your username"
              value={formData.gamerTag}
              onChange={handleChange}
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              placeholder="••••••"
              value={formData.password}
              onChange={handleChange}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Login"}
          </button>
        </form>

        <p className={`status-message ${status.type}`}>{status.message}</p>
      </section>
    </main>
  );
}

export default App;
