import { useState, useEffect, useCallback } from "react";
import "./Users.css";

const API_URL = "/api";

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Shipped",
  "Completed",
  "Cancelled",
];

const emptyProduct = {
  name: "",
  category: "",
  price: "",
  image: "",
  description: "",
};

function readSavedUser() {
  try {
    const token = localStorage.getItem("handwork_token");
    const saved = localStorage.getItem("handwork_user");

    if (!token || !saved) return null;

    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} DA`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Users({ onBack }) {
  const [user, setUser] = useState(readSavedUser);

  const [page, setPage] = useState(() => {
    const savedUser = readSavedUser();

    if (!savedUser) return "welcome";

    return savedUser.role?.toLowerCase() === "admin"
      ? "admin"
      : "client";
  });

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("");
  const [loading, setLoading] = useState(false);

  // ADMIN DATA
  const [activeTab, setActiveTab] = useState("overview");

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  // PRODUCT FORM
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [savingProduct, setSavingProduct] = useState(false);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  // ORDER DETAILS
  const [selectedOrder, setSelectedOrder] = useState(null);

  // CLIENT DETAILS
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientOrders, setClientOrders] = useState([]);
  const [clientOrdersLoading, setClientOrdersLoading] = useState(false);

  // MESSAGE DETAILS
  const [selectedMessage, setSelectedMessage] = useState(null);

  const isAdmin = user?.role?.toLowerCase() === "admin";

  function goTo(nextPage) {
    setNotice("");
    setNoticeType("");
    setPage(nextPage);
  }

  function showNotice(message, type = "error") {
    setNotice(message);
    setNoticeType(type);
  }

  async function getErrorMessage(response) {
    const data = await response.json().catch(() => ({}));

    if (data.errors) {
      return Object.values(data.errors).flat().join(" ");
    }

    return (
      data.message ||
      data.title ||
      data.detail ||
      `Request failed (${response.status}).`
    );
  }

  // LOGOUT
  function logout(message = "") {
    localStorage.removeItem("handwork_token");
    localStorage.removeItem("handwork_user");

    setUser(null);
    setPage("welcome");
    setLoginPassword("");
    setLoginPhone("");

    setProducts([]);
    setOrders([]);
    setClients([]);
    setMessages([]);
    setNotifications([]);
    setNotice(message);
    setNoticeType(message ? "error" : "");
  }

  // API REQUEST WITH JWT
  const authenticatedFetch = useCallback(async (endpoint, options = {}) => {
    const token = localStorage.getItem("handwork_token");

    if (!token) {
      logout("Please sign in again.");
      throw new Error("Authentication required.");
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      logout("Your session has expired. Please sign in again.");
      throw new Error("Your session has expired.");
    }

    if (response.status === 403) {
      throw new Error("Access denied. Admin permission is required.");
    }

    return response;
  }, []);

  // READ API RESPONSE
  async function readResponse(response) {
    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    if (response.status === 204) return null;

    const text = await response.text();

    return text ? JSON.parse(text) : null;
  }

  // LOGIN
  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    setNotice("");
    setNoticeType("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Phone: loginPhone,
          Password: loginPassword,
        }),
      });

      const data = await readResponse(response);

      if (!data?.token || !data?.user) {
        throw new Error("Invalid response from server.");
      }

      const role = data.user.role?.toLowerCase();

      if (role !== "admin" && role !== "client") {
        throw new Error("Unknown user role.");
      }

      localStorage.setItem("handwork_token", data.token);
      localStorage.setItem("handwork_user", JSON.stringify(data.user));

      setUser(data.user);
      setLoginPassword("");
      setPage(role === "admin" ? "admin" : "client");

      showNotice("Login successful!", "success");
    } catch (error) {
      showNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  // REGISTER
  async function handleRegister(event) {
    event.preventDefault();

    setLoading(true);
    setNotice("");
    setNoticeType("");

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: fullName,
          Email: email,
          Phone: phone,
          Address: address,
          Password: registerPassword,
        }),
      });

      await readResponse(response);

      const registeredPhone = phone;
      const registeredPassword = registerPassword;

      setFullName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setRegisterPassword("");

      // AUTOMATIC LOGIN
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Phone: registeredPhone,
          Password: registeredPassword,
        }),
      });

      const loginData = await readResponse(loginResponse);

      if (!loginData?.token || !loginData?.user) {
        setLoginPhone(registeredPhone);
        setPage("login");
        showNotice("Account created. Please sign in.", "success");
        return;
      }

      localStorage.setItem("handwork_token", loginData.token);
      localStorage.setItem(
        "handwork_user",
        JSON.stringify(loginData.user)
      );

      setUser(loginData.user);
      setPage("client");

      showNotice("Account created successfully!", "success");
    } catch (error) {
      showNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  // LOAD ALL ADMIN DATA
  // LOAD NOTIFICATIONS
// LOAD NOTIFICATIONS
const loadNotifications = useCallback(async () => {
  try {
    const response = await authenticatedFetch("/notifications");
    const data = await readResponse(response);

    setNotifications(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("Notifications API error:", error);
  }
}, [authenticatedFetch]);
  const loadAdminDashboard = useCallback(async () => {
    if (!isAdmin) return;

    setDashboardLoading(true);
    setDashboardError("");

    // Each section loads independently.
    // A failure in Messages will not prevent Products from loading.
    const loadSection = async (request, setter, sectionName) => {
      try {
        const response = await request;
        const data = await readResponse(response);

        setter(Array.isArray(data) ? data : []);

        return null;
      } catch (error) {
        return `${sectionName}: ${error.message}`;
      }
    };

    try {
      const results = await Promise.all([
        loadSection(
          fetch(`${API_URL}/products`),
          setProducts,
          "Products"
        ),

        loadSection(
          authenticatedFetch("/orders"),
          setOrders,
          "Orders"
        ),

        loadSection(
          authenticatedFetch("/clients"),
          setClients,
          "Clients"
        ),

        loadSection(
          authenticatedFetch("/messages"),
          setMessages,
          "Messages"
        ),
        loadSection(
        authenticatedFetch("/notifications"),
       setNotifications,
      "Notifications"
      ),
      ]);

      const errors = results.filter(Boolean);

      if (errors.length > 0) {
        setDashboardError(errors.join(" | "));
      }
    } finally {
      setDashboardLoading(false);
    }
  }, [isAdmin, authenticatedFetch]);

  useEffect(() => {
    if (page === "admin" && isAdmin) {
      loadAdminDashboard();
    }
  }, [page, isAdmin, loadAdminDashboard]);
  // AUTOMATIC NOTIFICATION REFRESH
useEffect(() => {
  if (page !== "admin" || !isAdmin) return;

  const interval = setInterval(() => {
    loadNotifications();
  }, 30000);

  return () => clearInterval(interval);
}, [page, isAdmin, loadNotifications]);
// AUTOMATIC NOTIFICATION REFRESH
useEffect(() => {
  if (page !== "admin" || !isAdmin) return;

  const interval = setInterval(() => {
    loadNotifications();
  }, 30000);

  return () => clearInterval(interval);
}, [page, isAdmin, loadNotifications]);
// MARK NOTIFICATION AS READ
async function handleMarkNotificationRead(notificationId) {
  try {
    const response = await authenticatedFetch(
      `/notifications/${notificationId}/read`,
      {
        method: "PUT",
      }
    );

    await readResponse(response);

    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification
      )
    );

  } catch (error) {
    showNotice(error.message);
  }
}

  // OPEN ADD PRODUCT FORM
  function openAddProduct() {
    setEditingProductId(null);

    setProductForm({
      ...emptyProduct,
    });

    setImageFile(null);
    setImagePreview("");

    setNotice("");
    setNoticeType("");

    setShowProductForm(true);
  }

  // OPEN EDIT PRODUCT FORM
  function openEditProduct(product) {
    setEditingProductId(product.id);

    setProductForm({
      name: product.name || "",
      category: product.category || "",
      price: product.price ?? "",
      image: product.image || "",
      description: product.description || "",
    });

    setImageFile(null);
    setImagePreview(product.image || "");

    setNotice("");
    setNoticeType("");

    setShowProductForm(true);
  }

  // HANDLE IMAGE SELECTION
  function handleImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      showNotice("Please select a JPG, PNG or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotice("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    setNotice("");
    setNoticeType("");
  }

  // SAVE PRODUCT: ADD OR UPDATE
  async function handleSaveProduct(event) {
    event.preventDefault();

    if (!productForm.name.trim() || !productForm.category.trim()) {
      showNotice("Product name and category are required.");
      return;
    }

    if (
      !Number.isFinite(Number(productForm.price)) ||
      Number(productForm.price) <= 0
    ) {
      showNotice("Please enter a valid product price.");
      return;
    }

    setSavingProduct(true);
    setNotice("");

    try {
      const isEditing = editingProductId !== null;

      // Keep existing image when editing without selecting a new one.
      let imageUrl = productForm.image.trim();

      // STEP 1: Upload image if a new file was selected.
      if (imageFile) {
        const formData = new FormData();

        formData.append("file", imageFile);

        const uploadResponse = await authenticatedFetch(
          "/products/upload-image",
          {
            method: "POST",
            body: formData,
          }
        );

        const uploadData = await readResponse(uploadResponse);

        if (!uploadData?.imageUrl) {
          throw new Error("Image upload failed.");
        }

        imageUrl = uploadData.imageUrl;
      }

      // STEP 2: Save product information in MySQL.
      const response = await authenticatedFetch(
        isEditing
          ? `/products/${editingProductId}`
          : "/products",
        {
          method: isEditing ? "PUT" : "POST",

          body: JSON.stringify({
            Name: productForm.name.trim(),
            Category: productForm.category.trim(),
            Price: Number(productForm.price),
            Image: imageUrl,
            Description: productForm.description.trim(),
          }),
        }
      );

      await readResponse(response);

      setShowProductForm(false);
      setEditingProductId(null);
      setProductForm({ ...emptyProduct });

      setImageFile(null);
      setImagePreview("");

      showNotice(
        isEditing
          ? "Product updated successfully."
          : "Product added successfully.",
        "success"
      );

      await loadAdminDashboard();
    } catch (error) {
      showNotice(error.message);
    } finally {
      setSavingProduct(false);
    }
  }

  // DELETE PRODUCT
  async function handleDeleteProduct(product) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${product.name}"?`
    );

    if (!confirmed) return;

    try {
      const response = await authenticatedFetch(
        `/products/${product.id}`,
        { method: "DELETE" }
      );

      await readResponse(response);

      showNotice("Product deleted successfully.", "success");

      await loadAdminDashboard();
    } catch (error) {
      showNotice(error.message);
    }
  }

  // UPDATE ORDER STATUS
  async function handleUpdateOrderStatus(orderId, status) {
    try {
      const response = await authenticatedFetch(
        `/orders/${orderId}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ Status: status }),
        }
      );

      const updatedOrder = await readResponse(response);

      setOrders((previous) =>
        previous.map((order) =>
          order.id === orderId ? updatedOrder : order
        )
      );

      setSelectedOrder(updatedOrder);

      showNotice("Order status updated successfully.", "success");
    } catch (error) {
      showNotice(error.message);
    }
  }

  // SHOW CLIENT DETAILS + CLIENT ORDERS
  async function openClientDetails(client) {
    setSelectedClient(client);
    setClientOrders([]);
    setClientOrdersLoading(true);

    try {
      const response = await authenticatedFetch(
        `/clients/${client.id}/orders`
      );

      const data = await readResponse(response);

      setClientOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      showNotice(error.message);
    } finally {
      setClientOrdersLoading(false);
    }
  }

  const totalRevenue = orders
    .filter((order) => order.status !== "Cancelled")
    .reduce(
      (total, order) => total + Number(order.total || 0),
      0
    );

  const pendingOrders = orders.filter(
    (order) => order.status === "Pending"
  ).length;
  const unreadNotifications = notifications.filter(
  (notification) => !notification.isRead
).length;

  // HEADER
  return (
    <div className="users-app">
      <header className="users-header">
        <button className="users-brand" onClick={() => goTo("welcome")}>
          <img src="/logo.png" alt="Hand Work" />
          <span>
            <strong>HAND WORK</strong>
            <small>GIFTS MADE WITH LOVE</small>
          </span>
        </button>

        <button className="users-back" onClick={onBack}>
          ← Retour à la boutique
        </button>
      </header>

      <main className="users-main">
        {/* WELCOME */}
        {page === "welcome" && (
          <section className="users-welcome users-panel">
            <div className="users-decoration">✧</div>
            <p className="users-kicker">WELCOME TO HAND WORK</p>

            <h1>
              Every gift tells
              <br />
              <span>a beautiful story.</span>
            </h1>

            <p className="users-description">
              Découvrez un univers de cadeaux personnalisés,
              créés avec amour pour vos moments les plus précieux.
            </p>

            <div className="users-actions">
              <button
                className="users-primary"
                onClick={() => goTo("login")}
              >
                Sign In <span>↗</span>
              </button>

              <button
                className="users-secondary"
                onClick={() => goTo("register")}
              >
                Create Account
              </button>
            </div>

            <div className="users-welcome-note">
              <span>♡</span>
              Made with love, just for you.
            </div>
          </section>
        )}

        {/* LOGIN */}
        {page === "login" && (
          <section className="users-auth users-panel">
            <div className="users-auth-side">
              <p className="users-kicker">WELCOME BACK</p>

              <h1>
                It's lovely
                <br />
                <span>to see you.</span>
              </h1>

              <p>
                Connectez-vous pour découvrir votre espace Hand Work.
              </p>

              <span className="users-big-flower">❀</span>
            </div>

            <form className="users-form" onSubmit={handleLogin}>
              <p className="users-kicker">YOUR ACCOUNT</p>
              <h2>Sign In</h2>

              <p className="users-form-description">
                Entrez vos informations pour continuer.
              </p>

              <label htmlFor="login-phone">Phone number</label>

              <input
                id="login-phone"
                type="tel"
                placeholder="05XXXXXXXX"
                value={loginPhone}
                onChange={(event) => setLoginPhone(event.target.value)}
                autoComplete="tel"
                required
              />

              <label htmlFor="login-password">Password</label>

              <input
                id="login-password"
                type="password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              {notice && (
                <div className={`users-notice ${noticeType}`}>
                  {notice}
                </div>
              )}

              <button
                className="users-primary users-full"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
                {!loading && <span>↗</span>}
              </button>

              <p className="users-switch">
                Don't have an account?{" "}
                <button type="button" onClick={() => goTo("register")}>
                  Create one
                </button>
              </p>
            </form>
          </section>
        )}

        {/* REGISTER */}
        {page === "register" && (
          <section className="users-auth users-panel">
            <div className="users-auth-side">
              <p className="users-kicker">JOIN OUR WORLD</p>

              <h1>
                A little joy,
                <br />
                <span>made for you.</span>
              </h1>

              <p>
                Créez votre espace et préparez vos prochaines belles surprises.
              </p>

              <span className="users-big-flower">♡</span>
            </div>

            <form className="users-form" onSubmit={handleRegister}>
              <p className="users-kicker">BECOME A MEMBER</p>
              <h2>Create Account</h2>

              <p className="users-form-description">
                Remplissez les informations ci-dessous.
              </p>

              <label htmlFor="register-name">Full name</label>

              <input
                id="register-name"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                required
              />

              <label htmlFor="register-email">Email address</label>

              <input
                id="register-email"
                type="email"
                placeholder="hello@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <label htmlFor="register-phone">Phone number</label>

              <input
                id="register-phone"
                type="tel"
                placeholder="05XXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                required
              />

              <label htmlFor="register-address">
                Address <span className="users-optional">(Optional)</span>
              </label>

              <input
                id="register-address"
                type="text"
                placeholder="Your address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="street-address"
              />

              <label htmlFor="register-password">Password</label>

              <input
                id="register-password"
                type="password"
                placeholder="At least 8 characters"
                minLength={8}
                value={registerPassword}
                onChange={(event) =>
                  setRegisterPassword(event.target.value)
                }
                autoComplete="new-password"
                required
              />

              {notice && (
                <div className={`users-notice ${noticeType}`}>
                  {notice}
                </div>
              )}

              <button
                className="users-primary users-full"
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create Account"}
                {!loading && <span>↗</span>}
              </button>

              <p className="users-switch">
                Already a member?{" "}
                <button type="button" onClick={() => goTo("login")}>
                  Sign in
                </button>
              </p>
            </form>
          </section>
        )}

        {/* CLIENT DASHBOARD */}
        {page === "client" && user && (
          <section className="users-dashboard">
            <div className="users-dashboard-top">
              <div>
                <p className="users-kicker">YOUR PERSONAL SPACE</p>

                <h1>
                  Bonjour, {user.name} <span>♡</span>
                </h1>

                <p>Bienvenue dans votre univers Hand Work.</p>
                <p className="users-user-email">{user.email}</p>
              </div>

              <span className="users-dashboard-badge">CLIENT</span>
            </div>

            <div className="users-stat-grid">
              <article className="users-stat-card">
                <span>♡</span>
                <strong>My favourites</strong>
                <p>Vos créations préférées</p>
                <small>À découvrir</small>
              </article>

              <article className="users-stat-card">
                <span>🎁</span>
                <strong>My orders</strong>
                <p>Vos commandes</p>
                <small>À découvrir</small>
              </article>

              <article className="users-stat-card">
                <span>✧</span>
                <strong>Personalisation</strong>
                <p>Votre prochaine idée</p>
                <small>À découvrir</small>
              </article>
            </div>

            <div className="users-dashboard-heading">
              <div>
                <p className="users-kicker">HAND PICKED FOR YOU</p>
                <h2>Explore our collection</h2>
              </div>

              <button className="users-secondary" onClick={onBack}>
                Visit boutique ↗
              </button>
            </div>

            <button className="users-text-button" onClick={() => logout()}>
              Sign out
            </button>
          </section>
        )}

        {/* ADMIN DASHBOARD */}
        {page === "admin" && user && isAdmin && (
          <section className="users-dashboard">
            <div className="users-dashboard-top">
              <div>
                <p className="users-kicker">BOUTIQUE MANAGEMENT</p>

                <h1>
                  Admin <span>Dashboard.</span>
                </h1>

                <p>Bienvenue dans l'espace de gestion Hand Work.</p>

                <p className="users-user-email">
                  {user.name} — {user.email}
                </p>
              </div>

              <span className="users-dashboard-badge">ADMIN</span>
            </div>

            {notice && (
              <div className={`users-notice ${noticeType}`}>
                {notice}
              </div>
            )}

            {dashboardError && (
              <div className="users-notice error">
                {dashboardError}
              </div>
            )}

            <div className="users-admin-toolbar">
              <div>
                <span className="users-admin-welcome-label">
                  MANAGEMENT CENTER
                </span>

                <strong>Hand Work Overview</strong>
              </div>

              <div className="users-admin-toolbar-actions">
  <button
    className="users-secondary notification-bell"
    onClick={() => setActiveTab("notifications")}
  >
    🔔 Notifications

    {unreadNotifications > 0 && (
      <span className="notification-count">
        {unreadNotifications}
      </span>
    )}
  </button>

  <button
    className="users-secondary"
    onClick={loadAdminDashboard}
    disabled={dashboardLoading}
  >
    {dashboardLoading ? "Refreshing..." : "↻ Refresh data"}
  </button>
</div>
            </div>

            {/* STATISTICS */}
            <div className="users-admin-stats">
              <article>
                <span>Products</span>
                <strong>{products.length}</strong>
                <small>Catalogue total</small>
              </article>

              <article>
                <span>Orders</span>
                <strong>{orders.length}</strong>
                <small>{pendingOrders} pending orders</small>
              </article>

              <article>
                <span>Customers</span>
                <strong>{clients.length}</strong>
                <small>Registered clients</small>
              </article>

              <article>
                <span>Revenue</span>
                <strong>{formatPrice(totalRevenue)}</strong>
                <small>Excluding cancelled orders</small>
              </article>
            </div>

            {/* ADMIN NAVIGATION */}
            <nav className="users-admin-nav">
              {[
  ["overview", "Overview"],
  ["products", "Products"],
  ["orders", "Orders"],
  ["clients", "Clients"],
  ["messages", "Messages"],
  ["notifications", "Notifications"],
].map(([key, label]) => (
                <button
                  key={key}
                  className={activeTab === key ? "active" : ""}
                  onClick={() => {
                    setActiveTab(key);
                    setSelectedOrder(null);
                    setSelectedClient(null);
                    setSelectedMessage(null);
                  }}
                >
                  {label}

                  {key === "orders" && orders.length > 0 && (
                    <span>{orders.length}</span>
                  )}

                  {key === "messages" && messages.length > 0 && (
                    <span>{messages.length}</span>
                  )}
                  {key === "notifications" && unreadNotifications > 0 && (
  <span>{unreadNotifications}</span>
)}
                </button>
              ))}
            </nav>

            {/* OVERVIEW */}
            {activeTab === "overview" && (
              <div className="users-admin-panel">
                <div className="users-dashboard-heading">
                  <div>
                    <p className="users-kicker">QUICK OVERVIEW</p>
                    <h2>Recent orders</h2>
                  </div>

                  <button
                    className="users-secondary"
                    onClick={() => setActiveTab("orders")}
                  >
                    View all orders ↗
                  </button>
                </div>

                {dashboardLoading ? (
                  <p className="users-empty">Loading dashboard...</p>
                ) : orders.length === 0 ? (
                  <p className="users-empty">No orders yet.</p>
                ) : (
                  <div className="users-admin-table-wrap">
                    <table className="users-admin-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {orders.slice(0, 5).map((order) => (
                          <tr key={order.id}>
                            <td>#{order.id}</td>
                            <td>{order.clientName}</td>
                            <td>{formatDate(order.createdAt)}</td>
                            <td>{formatPrice(order.total)}</td>
                            <td>
                              <span className="users-status">
                                {order.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="users-table-action"
                                onClick={() => setSelectedOrder(order)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="users-overview-shortcuts">
                  <button onClick={() => setActiveTab("products")}>
                    <span>＋</span>
                    <strong>Manage products</strong>
                    <small>Add or update your catalogue</small>
                  </button>

                  <button onClick={() => setActiveTab("clients")}>
                    <span>♡</span>
                    <strong>View customers</strong>
                    <small>Explore your client list</small>
                  </button>

                  <button onClick={() => setActiveTab("messages")}>
                    <span>✉</span>
                    <strong>Read messages</strong>
                    <small>Messages from your visitors</small>
                  </button>
                </div>
              </div>
            )}

            {/* PRODUCTS */}
            {activeTab === "products" && (
              <div className="users-admin-panel">
                <div className="users-dashboard-heading">
                  <div>
                    <p className="users-kicker">YOUR CATALOGUE</p>
                    <h2>Product management</h2>
                  </div>

                  <button
                    className="users-primary"
                    onClick={openAddProduct}
                  >
                    + Add product
                  </button>
                </div>

                {dashboardLoading ? (
                  <p className="users-empty">Loading products...</p>
                ) : products.length === 0 ? (
                  <p className="users-empty">
                    No products found. Add your first product.
                  </p>
                ) : (
                  <div className="users-admin-table-wrap">
                    <table className="users-admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {products.map((product) => (
                          <tr key={product.id}>
                            <td>#{product.id}</td>

                            <td>
                              <div className="users-product-cell">
                                {product.image && (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                )}

                                <strong>{product.name}</strong>
                              </div>
                            </td>

                            <td>{product.category}</td>
                            <td>{formatPrice(product.price)}</td>

                            <td>
                              <div className="users-table-actions">
                                <button
                                  className="users-table-action"
                                  onClick={() => openEditProduct(product)}
                                >
                                  Edit
                                </button>

                                <button
                                  className="users-table-action danger"
                                  onClick={() => handleDeleteProduct(product)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ORDERS */}
            {activeTab === "orders" && (
              <div className="users-admin-panel">
                <div className="users-dashboard-heading">
                  <div>
                    <p className="users-kicker">CUSTOMER PURCHASES</p>
                    <h2>Order management</h2>
                  </div>
                </div>

                {dashboardLoading ? (
                  <p className="users-empty">Loading orders...</p>
                ) : orders.length === 0 ? (
                  <p className="users-empty">No orders found.</p>
                ) : (
                  <div className="users-admin-table-wrap">
                    <table className="users-admin-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Phone</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {orders.map((order) => (
                          <tr key={order.id}>
                            <td>#{order.id}</td>
                            <td>{order.clientName}</td>
                            <td>{order.clientPhone}</td>
                            <td>{formatDate(order.createdAt)}</td>
                            <td>{formatPrice(order.total)}</td>

                            <td>
                              <span className="users-status">
                                {order.status}
                              </span>
                            </td>

                            <td>
                              <button
                                className="users-table-action"
                                onClick={() => setSelectedOrder(order)}
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* CLIENTS */}
            {activeTab === "clients" && (
              <div className="users-admin-panel">
                <div className="users-dashboard-heading">
                  <div>
                    <p className="users-kicker">YOUR COMMUNITY</p>
                    <h2>Customer management</h2>
                  </div>
                </div>

                {dashboardLoading ? (
                  <p className="users-empty">Loading clients...</p>
                ) : clients.length === 0 ? (
                  <p className="users-empty">No clients found.</p>
                ) : (
                  <div className="users-admin-table-wrap">
                    <table className="users-admin-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Address</th>
                          <th>Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {clients.map((client) => (
                          <tr key={client.id}>
                            <td>{client.name}</td>
                            <td>{client.email}</td>
                            <td>{client.phone}</td>
                            <td>{client.address || "—"}</td>

                            <td>
                              <button
                                className="users-table-action"
                                onClick={() => openClientDetails(client)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* MESSAGES */}
            {activeTab === "messages" && (
              <div className="users-admin-panel">
                <div className="users-dashboard-heading">
                  <div>
                    <p className="users-kicker">LET'S KEEP IN TOUCH</p>
                    <h2>Contact messages</h2>
                  </div>
                </div>

                {dashboardLoading ? (
                  <p className="users-empty">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="users-empty">No messages received yet.</p>
                ) : (
                  <div className="users-admin-table-wrap">
                    <table className="users-admin-table">
                      <thead>
                        <tr>
                          <th>Sender</th>
                          <th>Email</th>
                          <th>Subject</th>
                          <th>Date</th>
                          <th>Message</th>
                        </tr>
                      </thead>

                      <tbody>
                        {messages.map((message) => (
                          <tr key={message.id}>
                            <td>{message.name}</td>
                            <td>{message.email}</td>
                            <td>{message.subject || "—"}</td>
                            <td>{formatDate(message.createdAt)}</td>

                            <td>
                              <button
                                className="users-table-action"
                                onClick={() => setSelectedMessage(message)}
                              >
                                Read
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {/* NOTIFICATIONS */}
{activeTab === "notifications" && (
  <div className="users-admin-panel">

    <div className="users-dashboard-heading">
      <div>
        <p className="users-kicker">STAY UPDATED</p>
        <h2>Notifications 🔔</h2>
        <p>
          You have {unreadNotifications} unread notification(s).
        </p>
      </div>

      <button
        className="users-secondary"
        onClick={loadNotifications}
      >
        ↻ Refresh
      </button>
    </div>

    {notifications.length === 0 ? (
      <p className="users-empty">
        No notifications yet.
      </p>
    ) : (
      <div className="users-admin-table-wrap">
        <table className="users-admin-table">

          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>Message</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {notifications.map((notification) => (
              <tr key={notification.id}>

                <td>
                  {notification.type === "Order"
                    ? "🛍️ Order"
                    : "✉ Message"}
                </td>

                <td>{notification.title}</td>

                <td>{notification.message}</td>

                <td>{formatDate(notification.createdAt)}</td>

                <td>
                  <span
                    className={`users-status ${
                      notification.isRead ? "" : "notification-new"
                    }`}
                  >
                    {notification.isRead ? "Read" : "New"}
                  </span>
                </td>

                <td>
                  {!notification.isRead ? (
                    <button
                      className="users-table-action"
                      onClick={() =>
                        handleMarkNotificationRead(notification.id)
                      }
                    >
                      Mark as read
                    </button>
                  ) : (
                    <span>✓</span>
                  )}
                </td>

              </tr>
            ))}
          </tbody>

        </table>
      </div>
    )}

  </div>
)}

            {/* ADD / EDIT PRODUCT MODAL */}
            {showProductForm && (
              <div
                className="users-modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setShowProductForm(false);
                  }
                }}
              >
                <form
                  className="users-modal"
                  onSubmit={handleSaveProduct}
                >
                  <button
                    type="button"
                    className="users-modal-close"
                    onClick={() => setShowProductForm(false)}
                  >
                    ×
                  </button>

                  <p className="users-kicker">PRODUCT CATALOGUE</p>

                  <h2>
                    {editingProductId ? "Edit product" : "Add new product"}
                  </h2>

                  <label>Product name</label>

                  <input
                    value={productForm.name}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        name: event.target.value,
                      })
                    }
                    required
                  />

                  <label>Category</label>

                  <input
                    value={productForm.category}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        category: event.target.value,
                      })
                    }
                    placeholder="Weddings, Graduation..."
                    required
                  />

                  <label>Price (DA)</label>

                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={productForm.price}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        price: event.target.value,
                      })
                    }
                    required
                  />

                  <label>Product Image</label>

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                  />

                  {imagePreview && (
                    <div className="users-image-preview">
                      <p>Image preview</p>

                      <img
                        src={imagePreview}
                        alt="Product preview"
                      />

                      <button
                        type="button"
                        className="users-table-action danger"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview("");

                          setProductForm({
                            ...productForm,
                            image: "",
                          });
                        }}
                      >
                        Remove image
                      </button>
                    </div>
                  )}

                  <label>Description</label>

                  <textarea
                    rows="4"
                    value={productForm.description}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        description: event.target.value,
                      })
                    }
                    placeholder="Describe your product..."
                  />

                  <div className="users-modal-actions">
                    <button
                      type="button"
                      className="users-secondary"
                      onClick={() => setShowProductForm(false)}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="users-primary"
                      disabled={savingProduct}
                    >
                      {savingProduct
                        ? "Saving..."
                        : editingProductId
                          ? "Save changes"
                          : "Add product"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ORDER DETAILS MODAL */}
            {selectedOrder && (
              <div className="users-modal-backdrop">
                <div className="users-modal">
                  <button
                    className="users-modal-close"
                    onClick={() => setSelectedOrder(null)}
                  >
                    ×
                  </button>

                  <p className="users-kicker">ORDER DETAILS</p>
                  <h2>Order #{selectedOrder.id}</h2>

                  <div className="users-detail-list">
                    <p>
                      <strong>Customer:</strong> {selectedOrder.clientName}
                    </p>

                    <p>
                      <strong>Phone:</strong> {selectedOrder.clientPhone}
                    </p>

                    <p>
                      <strong>Date:</strong> {formatDate(selectedOrder.createdAt)}
                    </p>

                    <p>
                      <strong>Total:</strong> {formatPrice(selectedOrder.total)}
                    </p>
                  </div>

                  <h3>Ordered products</h3>

                  <div className="users-order-items">
                    {(selectedOrder.items || []).map((item, index) => (
                      <div key={`${item.productId}-${index}`}>
                        <span>
                          {item.productName} × {item.quantity}
                        </span>

                        <strong>{formatPrice(item.subtotal)}</strong>
                      </div>
                    ))}
                  </div>

                  <label>Update order status</label>

                  <select
                    value={selectedOrder.status}
                    onChange={(event) =>
                      handleUpdateOrderStatus(
                        selectedOrder.id,
                        event.target.value
                      )
                    }
                  >
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <button
                    className="users-secondary users-modal-done"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* CLIENT DETAILS MODAL */}
            {selectedClient && (
              <div className="users-modal-backdrop">
                <div className="users-modal">
                  <button
                    className="users-modal-close"
                    onClick={() => setSelectedClient(null)}
                  >
                    ×
                  </button>

                  <p className="users-kicker">CUSTOMER PROFILE</p>
                  <h2>{selectedClient.name}</h2>

                  <div className="users-detail-list">
                    <p>
                      <strong>Email:</strong> {selectedClient.email}
                    </p>

                    <p>
                      <strong>Phone:</strong> {selectedClient.phone}
                    </p>

                    <p>
                      <strong>Address:</strong> {selectedClient.address || "—"}
                    </p>
                  </div>

                  <h3>Customer orders</h3>

                  {clientOrdersLoading ? (
                    <p>Loading orders...</p>
                  ) : clientOrders.length === 0 ? (
                    <p className="users-empty">
                      No orders for this client.
                    </p>
                  ) : (
                    <div className="users-order-items">
                      {clientOrders.map((order) => (
                        <div key={order.id}>
                          <span>
                            Order #{order.id} — {order.status}
                          </span>

                          <strong>{formatPrice(order.total)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="users-secondary users-modal-done"
                    onClick={() => setSelectedClient(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* MESSAGE DETAILS MODAL */}
            {selectedMessage && (
              <div className="users-modal-backdrop">
                <div className="users-modal">
                  <button
                    className="users-modal-close"
                    onClick={() => setSelectedMessage(null)}
                  >
                    ×
                  </button>

                  <p className="users-kicker">CONTACT MESSAGE</p>

                  <h2>{selectedMessage.subject || "New message"}</h2>

                  <div className="users-detail-list">
                    <p>
                      <strong>From:</strong> {selectedMessage.name}
                    </p>

                    <p>
                      <strong>Email:</strong> {selectedMessage.email}
                    </p>

                    <p>
                      <strong>Date:</strong> {formatDate(selectedMessage.createdAt)}
                    </p>
                  </div>

                  <div className="users-message-content">
                    {selectedMessage.message}
                  </div>

                  <a
                    className="users-primary users-reply-link"
                    href={`mailto:${selectedMessage.email}`}
                  >
                    Reply by email ↗
                  </a>
                </div>
              </div>
            )}

            <button
              className="users-text-button"
              onClick={() => logout()}
            >
              Sign out
            </button>
          </section>
        )}

        {/* INVALID OR EXPIRED SESSION */}
        {page === "admin" && user && !isAdmin && (
          <section className="users-panel users-access-denied">
            <h2>Access denied</h2>

            <p>This page is only available to administrators.</p>

            <button
              className="users-primary"
              onClick={() => logout()}
            >
              Sign out
            </button>
          </section>
        )}
      </main>

      <footer className="users-footer">
        <span>© {new Date().getFullYear()} HAND WORK</span>
        <span>Made with ♡ in Sétif, Algeria</span>
      </footer>
    </div>
  );
}

export default Users;