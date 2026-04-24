import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

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
  pendingHours: "",
  pendingMinutes: ""
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });

function App() {
  const pageSize = 20;
  const entryToken = useMemo(() => new URLSearchParams(window.location.search).get("entryToken") || "", []);
  const [currentView, setCurrentView] = useState("home");
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    gamerTag: "",
    password: ""
  });
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [customers, setCustomers] = useState([]);
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authToken, setAuthToken] = useState("");
  const [adminName, setAdminName] = useState("");
  const [systemName, setSystemName] = useState("Gaming Zone");
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [settingsData, setSettingsData] = useState(null);
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
        photoUrl
      }));
    } catch (error) {
      setPublicStatus({
        type: "error",
        message: error.message
      });
    }
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
        photoUrl
      }));
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    }
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

    if (!customer.sessionStartedAt || !bookedTotalMinutes) {
      return {
        ...customer,
        bookedHours,
        bookedMinutes,
        remainingHours: bookedHours,
        remainingMinutes: bookedMinutes,
        remainingTotalMinutes: bookedTotalMinutes,
        sessionExpired: false
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

    return {
      ...customer,
      bookedHours,
      bookedMinutes,
      remainingHours: Math.floor(remainingMinutes / 60),
      remainingMinutes: remainingMinutes % 60,
      remainingTotalMinutes: remainingMinutes,
      sessionActive: remainingMinutes > 0,
      sessionExpired: remainingMinutes === 0
    };
  };

  const liveCustomers = customers.map(getLiveCustomer);

  const filteredCustomers = liveCustomers.filter((customer) => {
    const query = customerFilter.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [customer.customerName, customer.phoneNumber, customer.email]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    if (!matchesSearch) {
      return false;
    }

    if (statusFilter === "with-email") {
      return Boolean(customer.email);
    }

    if (statusFilter === "high-pending") {
      return customer.pendingCost >= 100;
    }

    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCustomers = filteredCustomers.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const paginationWindowStart = Math.max(1, safeCurrentPage - 1);
  const paginationWindowEnd = Math.min(totalPages, paginationWindowStart + 2);
  const pageNumbers = Array.from(
    { length: paginationWindowEnd - paginationWindowStart + 1 },
    (_, index) => paginationWindowStart + index
  );

  const totalPendingAmount = liveCustomers.reduce((sum, customer) => sum + customer.pendingCost, 0);
  const totalPendingMinutes = liveCustomers.reduce(
    (sum, customer) => sum + (customer.remainingTotalMinutes ?? customer.totalPendingMinutes ?? 0),
    0
  );
  const totalPendingHours = (totalPendingMinutes / 60).toFixed(1);
  const customersWithEmail = liveCustomers.filter((customer) => customer.email).length;

  const formatDateTime = (value) => {
    if (!value) {
      return "Not available";
    }

    return new Date(value).toLocaleString();
  };

  const loadCustomers = async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/customers`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load customers.");
    }

    setCustomers(data.customers);
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
        await loadCustomers(parsed.token);
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
    setCurrentPage(1);
  }, [customerFilter, statusFilter, currentView]);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      try {
        await loadCustomers(authToken);
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
  }, [authToken]);

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setStatus({
        type: "",
        message: "Authenticating..."
      });

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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
      await loadCustomers(data.token);
      await loadSettings(data.token);
      setStatus({
        type: "success",
        message: `Welcome back, ${data.user.gamerTag}. Session saved for 1 day.`
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      setSettingsLoading(true);
      await loadSettings(authToken);
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

      const response = await fetch(`${API_BASE_URL}/api/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          customerName: customerForm.customerName,
          phoneNumber: customerForm.phoneNumber,
          email: customerForm.email,
          photoUrl: customerForm.photoUrl,
          pendingHours: customerForm.pendingHours,
          pendingMinutes: customerForm.pendingMinutes,
          hourlyRate: customerForm.hourlyRate
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout("Session expired. Please login again.");
          return;
        }
        throw new Error(data.message || "Unable to save customer.");
      }

      setCustomers((current) => [data.customer, ...current]);
      setCustomerForm(initialCustomerForm);
      setShowCustomerModal(false);
      setStatus({
        type: "success",
        message: `${data.customer.customerName} added successfully.`
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

              <label>
                Photo
                <input name="photo" type="file" accept="image/*" capture="environment" onChange={handlePublicPhotoChange} />
              </label>

              {publicForm.photoUrl ? <img className="photo-preview" src={publicForm.photoUrl} alt="Customer preview" /> : null}

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

                  <select
                    className="toolbar-select"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All Customers</option>
                    <option value="with-email">With Email</option>
                    <option value="high-pending">High Pending</option>
                  </select>

                  <button type="button" className="primary-button" onClick={() => setShowCustomerModal(true)}>
                    Add Customer
                  </button>
                </div>
              </section>

              <section className="table-card">
                <div className="table-heading">
                  <h2>Customer List</h2>
                  <p className={`status-message ${status.type}`}>{status.message}</p>
                </div>

                <div className="table-wrapper customer-table-wrapper">
                  <div className="table-row table-head">
                    <span>Client</span>
                    <span>Phone</span>
                    <span>Pending Time</span>
                    <span>Time Left</span>
                    <span>Status</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span>Action</span>
                  </div>

                  {filteredCustomers.length === 0 ? (
                    <div className="empty-table">No customers found.</div>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <div className="table-row customer-table-row" key={customer._id}>
                        <span className="client-cell">
                          <strong>{customer.customerName}</strong>
                        </span>
                        <span>{customer.phoneNumber}</span>
                        <span>
                          {customer.bookedHours ?? customer.pendingHours}h {customer.bookedMinutes ?? customer.pendingMinutes}m
                        </span>
                        <span className={customer.sessionExpired ? "time-status time-status-expired" : "time-status"}>
                          {customer.sessionExpired
                            ? "Times up"
                            : customer.sessionPending
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
                            <button
                              type="button"
                              className="table-action-button"
                              onClick={() => handleActivateCustomer(customer._id)}
                            >
                              Activate
                            </button>
                          ) : customer.sessionActive ? (
                            <span className="table-action-label table-action-label-active">Running</span>
                          ) : (
                            <span className="table-action-label table-action-label-expired">Times up</span>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {filteredCustomers.length > 0 ? (
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
        </section>

        {showCustomerModal ? (
          <div className="modal-backdrop" onClick={() => setShowCustomerModal(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <p className="card-label">Add Customer</p>
                  <h2>New entry</h2>
                </div>
                <button
                  type="button"
                  className="close-button"
                  onClick={() => setShowCustomerModal(false)}
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

                <label>
                  Photo
                  <input name="photo" type="file" accept="image/*" onChange={handleCustomerPhotoChange} />
                </label>

                {customerForm.photoUrl ? (
                  <img className="photo-preview" src={customerForm.photoUrl} alt="Customer preview" />
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
                  New customers stay pending first. Timer starts only when you click Activate in the customer list.
                </p>

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
                  {customerLoading ? "Saving..." : "Save Customer"}
                </button>
              </form>
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
