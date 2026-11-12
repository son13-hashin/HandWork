
import { useEffect, useState } from "react";
import "./App.css";
import Users from "./Users";

// IMPORTANT:
// Change this URL if your ASP.NET Core backend uses another port.
const API_URL = "";
const families = [
  {
    id: 1,
    name: "Graduation",
    description: "Celebrate achievements and new beginnings.",
    image: "/images/grad.jpg",
  },
  {
    id: 2,
    name: "Stickers",
    description: "Personalized stickers for every occasion.",
    image: "/images/stickers.jpg",
  },
  {
    id: 3,
    name: "Wedding",
    description: "Beautiful details for your special day.",
    image: "/images/wedding.jpg",
  },
  {
    id: 4,
    name: "Gift Boxes",
    description: "Thoughtful gifts for your loved ones.",
    image: "/images/boxes.jpg",
  },
];

async function readResponse(response) {
  const text = await response.text();

  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.title ||
      `Request failed with status ${response.status}`
    );
  }

  return data;
}
function App() {
  const [showUsers, setShowUsers] = useState(false);
  const authToken = localStorage.getItem("handwork_token");
  const isLoggedIn = Boolean(authToken);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState([]);
  const [notice, setNotice] = useState("");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submittingContact, setSubmittingContact] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  // LOAD PRODUCTS FROM ASP.NET CORE API
  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoadingProducts(true);
      setProductsError("");

      try {
        const response = await fetch(`${API_URL}/api/products`);
        const data = await readResponse(response);

        if (!Array.isArray(data)) {
          throw new Error("The products API did not return a product list.");
        }

        if (!cancelled) {
          setProducts(data);
        }
      } catch (error) {
        if (!cancelled) {
          setProductsError(
            "Could not load products. Please make sure the backend is running."
          );

          console.error("Products API error:", error);
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  function showNotification(message) {
    setNotice(message);

    window.clearTimeout(window.notificationTimer);

    window.notificationTimer = window.setTimeout(() => {
      setNotice("");
    }, 4000);
  }

  if (showUsers) {
    return <Users onBack={() => setShowUsers(false)} />;
  }

  const familyProducts = products.filter((product) => {
    const matchesFamily = product.category === selectedFamily;

    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    return matchesFamily && matchesSearch;
  });

  function addToCart(product, amount = 1) {
    setCart((previousCart) => {
      const existingProduct = previousCart.find(
        (item) => item.id === product.id
      );

      if (existingProduct) {
        return previousCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + amount }
            : item
        );
      }

      return [...previousCart, { ...product, quantity: amount }];
    });

    showNotification(`${product.name} added to your order.`);
  }

  function updateCartQuantity(productId, amount) {
    setCart((previousCart) =>
      previousCart
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId) {
    setCart((previousCart) =>
      previousCart.filter((item) => item.id !== productId)
    );

    showNotification("Product removed from your order.");
  }

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  // REGISTER CUSTOMER, THEN CREATE ORDER
  async function handleOrderSubmit(event) {
    event.preventDefault();

    if (submittingOrder) return;

    if (cart.length === 0) {
      showNotification("Please add a product to your order first.");
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      showNotification("Please enter your name and phone number.");
      return;
    }

    setSubmittingOrder(true);

    try {
      // STEP 1: Register customer
      const clientResponse = await fetch(`${API_URL}/api/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: "",
          address: "",
        }),
      });

      const client = await readResponse(clientResponse);

      // STEP 2: Create order with product IDs and quantities
      const orderResponse = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: client.id,
          customerMessage: customerMessage.trim(),
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const order = await readResponse(orderResponse);

      showNotification(
        `Thank you! Order #${order.id} was submitted successfully. Total: ${Number(
          order.total
        ).toLocaleString("fr-DZ")} DA.`
      );

      setCustomerName("");
      setCustomerPhone("");
      setCustomerMessage("");
      setCart([]);
    } catch (error) {
      console.error("Order submission error:", error);

      showNotification(
        `Could not submit your order: ${error.message}. Your cart has been kept.`
      );
    } finally {
      setSubmittingOrder(false);
    }
  }

  // SEND CONTACT MESSAGE TO BACKEND
async function handleContactSubmit(event) {
  event.preventDefault();

  if (submittingContact) return;

  const authToken = localStorage.getItem("handwork_token");

  if (!authToken) {
    showNotification("Please login to send a message.");
    setShowUsers(true);
    return;
  }

  if (
    !contactName.trim() ||
    !contactEmail.trim() ||
    !contactMessage.trim()
  ) {
    showNotification("Please complete all fields.");
    return;
  }

  setSubmittingContact(true);

  try {
    const response = await fetch(`${API_URL}/api/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: contactName.trim(),
        email: contactEmail.trim(),
        message: contactMessage.trim(),
      }),
    });

    await readResponse(response);

    showNotification("Thank you! Your message was received successfully.");

    setContactName("");
    setContactEmail("");
    setContactMessage("");
  } catch (error) {
    console.error("Contact API error:", error);

    showNotification(
      `Could not send your message: ${error.message}. Please try again.`
    );
  } finally {
    setSubmittingContact(false);
  }
}


  return (
    <div className="app">
      {/* ANNOUNCEMENT */}
      <div className="announcement">
        <span>✧</span>
        S
        <span>✧</span>
      </div>

      {/* NAVBAR */}
      <header className="navbar">
        <a href="#home" className="brand" onClick={closeMenu}>
          <img src="/logo.png" alt="Hand Work logo" />

          <div className="brand-text">
            <strong>HAND WORK</strong>
            <small>GIFTS MADE WITH LOVE</small>
          </div>
        </a>

        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          {menuOpen ? "×" : "☰"}
        </button>

        <nav className={`nav-links ${menuOpen ? "nav-open" : ""}`}>
          <a href="#home" onClick={closeMenu}>Home</a>
          <a href="#collection" onClick={closeMenu}>Collection</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#contact" onClick={closeMenu}>Contact</a>

          <button
            type="button"
            className="nav-account"
            onClick={() => {
              closeMenu();
              setShowUsers(true);
            }}
          >
            My Account ♡
          </button>

          <a href="#order" className="nav-order" onClick={closeMenu}>
            Order Now
            <span className="cart-count">{cartCount}</span>
            <span>↗</span>
          </a>
        </nav>
      </header>

      {/* NOTIFICATION */}
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      <main>
        {/* HERO */}
        <section className="hero" id="home">
          <div className="hero-content">
            <p className="eyebrow">✧ HANDMADE WITH LOVE</p>

            <h1>
              Little Details,
              <br />
              <span>Beautiful Memories.</span>
            </h1>

            <p className="hero-description">
              Discover personalized gifts and handmade creations made
              especially for your unforgettable moments.
            </p>

            <div className="hero-actions">
              <a href="#collection" className="button button-primary">
                Explore Collection ↗
              </a>

              <a href="#about" className="button button-outline">
                Our Story
              </a>
            </div>

            <div className="hero-note">
              <span>♡</span>
              <p>
                Every creation tells a story.
                <br />
                Every detail is made with love.
              </p>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-frame">
              <img
                src="/images/grad.jpg"
                alt="Handmade graduation gift"
                className="hero-image"
              />
            </div>

            <div className="floating-card">
              <span>♡</span>
              <div>
                <strong>Made for you</strong>
                <small>Personalized with care</small>
              </div>
            </div>

            <div className="hero-stamp">
              HAND WORK
              <small>MADE WITH LOVE</small>
            </div>
          </div>
        </section>

        {/* VALUES */}
        <section className="values-strip">
          <div className="value-item">
            <span>♡</span>
            <div>
              <strong>Made with Love</strong>
              <small>Carefully handmade creations</small>
            </div>
          </div>

          <div className="value-item">
            <span>✧</span>
            <div>
              <strong>Personalized</strong>
              <small>Designed around your ideas</small>
            </div>
          </div>

          <div className="value-item">
            <span>❀</span>
            <div>
              <strong>Special Moments</strong>
              <small>Gifts for every occasion</small>
            </div>
          </div>
        </section>

        {/* ABOUT */}
        <section className="about section-space" id="about">
          <div className="about-visual">
            <img
              src="/images/person.jpg"
              alt="Handmade gift box"
              className="about-image"
            />

            <div className="about-caption">
              ♡ Little things, big feelings.
            </div>
          </div>

          <div className="about-content">
            <p className="section-kicker">A LITTLE ABOUT US</p>

            <h2>
              More than a gift,
              <br />
              <span>it's a feeling.</span>
            </h2>

            <p>
              At Hand Work, we believe that the smallest details can
              make the biggest difference. Every creation is prepared
              with attention, creativity and love.
            </p>

            <p>
              From personalized stickers to graduation gifts and wedding
              favors, we help you make every occasion memorable.
            </p>

            <a href="#collection" className="text-link">
              Discover Our Creations ↗
            </a>
          </div>
        </section>

        {/* COLLECTION */}
        <section className="collection section-space" id="collection">
          <div className="section-heading">
            <div>
              <p className="section-kicker">OUR CREATIONS</p>

              <h2>
                Discover Our <span>Collection</span>
              </h2>
            </div>

            <p className="section-heading-note">
              Explore our handmade families
              <br />
              and find something special for you.
            </p>
          </div>

          {!selectedFamily ? (
            <div className="family-grid">
              {families.map((family) => (
                <button
                  type="button"
                  className="family-card"
                  key={family.id}
                  onClick={() => {
                    setSelectedFamily(family.name);
                    setSearchTerm("");
                  }}
                >
                  <div className="family-image-wrap">
                    <img
                      src={family.image}
                      alt={family.name}
                      className="family-image"
                      loading="lazy"
                    />

                    <span className="family-arrow">↗</span>
                  </div>

                  <div className="family-info">
                    <h3>{family.name}</h3>
                    <p>{family.description}</p>
                    <span className="family-explore">
                      Explore Family →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="family-products">
              <button
                type="button"
                className="back-to-families"
                onClick={() => {
                  setSelectedFamily(null);
                  setSearchTerm("");
                }}
              >
                ← Back to Collections
              </button>

              <div className="family-title">
                <p className="section-kicker">
                  EXPLORE OUR CREATIONS
                </p>

                <h2>
                  {selectedFamily} <span>Collection</span>
                </h2>

                <p>
                  Discover all our creations in this family.
                </p>
              </div>

              <input
                type="search"
                className="product-search"
                placeholder={`Search ${selectedFamily} products...`}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search products in this family"
              />

              {loadingProducts ? (
                <div className="empty-products">
                  <h3>Loading products...</h3>
                  <p>Please wait while we load our collection.</p>
                </div>
              ) : productsError ? (
                <div className="empty-products">
                  <span>♡</span>
                  <h3>Unable to load products</h3>
                  <p>{productsError}</p>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => window.location.reload()}
                  >
                    Try Again
                  </button>
                </div>
              ) : familyProducts.length > 0 ? (
                <div className="product-grid">
                  {familyProducts.map((product) => (
                    <article className="product-card" key={product.id}>
                      <div className="product-image-wrap">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="product-image"
                          loading="lazy"
                        />

                        <span className="product-tag">HANDMADE</span>

                        <button
                          type="button"
                          className="product-quick-order"
                          onClick={() => addToCart(product)}
                          aria-label={`Add ${product.name} to order`}
                        >
                          +
                        </button>
                      </div>

                      <div className="product-info">
                        <div className="product-title-row">
                          <h3>{product.name}</h3>
                          <span className="product-heart">♡</span>
                        </div>

                        <p>{product.description}</p>

                        <div className="product-bottom">
                          <span className="product-price">
                            {Number(product.price).toLocaleString("fr-DZ")} DA
                          </span>

                          <button
                            type="button"
                            className="product-order-link"
                            onClick={() => addToCart(product)}
                          >
                            + Add to order
                          </button>
                        </div>

                        <button
                          type="button"
                          className="details-button"
                          onClick={() => {
                            setSelectedProduct(product);
                            setQuantity(1);
                          }}
                        >
                          View details ↗
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-products">
                  <span>♡</span>
                  <h3>No products found</h3>
                  <p>
                    {products.length === 0
                      ? "No products are available yet."
                      : "Try another search."}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* QUOTE */}
        <section className="quote-banner">
          <p className="section-kicker">A GIFT FROM THE HEART</p>

          <h2>
            It's not just a gift,
            <br />
            <span>it's a beautiful memory.</span>
          </h2>

          <p>
            Make your special moments unforgettable with Hand Work.
          </p>

          <a href="#collection" className="button button-light">
            Discover Our Collection ↗
          </a>
        </section>

        {/* SERVICES */}
        <section className="services section-space">
          <div className="center-heading">
            <p className="section-kicker">WHAT WE CREATE</p>

            <h2>
              Made for Your <span>Moments</span>
            </h2>

            <p>
              Handmade creations for the people and moments that matter.
            </p>
          </div>

          <div className="services-grid">
            <article className="service-card">
              <span className="service-icon">♡</span>
              <h3>Wedding Favours</h3>
              <p>
                Personalized gifts and favours for weddings and bridal
                occasions.
              </p>

              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setSelectedFamily("Wedding");
                  document.getElementById("collection")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                Explore gifts ↗
              </button>
            </article>

            <article className="service-card">
              <span className="service-icon">✧</span>
              <h3>Graduation Gifts</h3>
              <p>
                Special keepsakes to celebrate achievements and new
                beginnings.
              </p>

              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setSelectedFamily("Graduation");
                  document.getElementById("collection")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                Explore gifts ↗
              </button>
            </article>

            <article className="service-card">
              <span className="service-icon">❀</span>
              <h3>Custom Creations</h3>
              <p>
                Stickers, gift boxes and personalized designs inspired by
                your ideas.
              </p>

              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setSelectedFamily("Gift Boxes");
                  document.getElementById("collection")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                Explore gifts ↗
              </button>
            </article>
          </div>
        </section>

        {/* ORDER */}
        <section className="order-section section-space" id="order">
          <div className="center-heading">
            <p className="section-kicker">YOUR SPECIAL ORDER</p>

            <h2>
              Create Your <span>Order</span>
            </h2>

            <p>
              Choose your favorite creations and prepare your order.
            </p>
          </div>

          <div className="order-layout">
            <div className="cart-panel">
              <div className="panel-heading">
                <h3>Your Shopping List</h3>
                <span>{cartCount} item(s)</span>
              </div>

              {cart.length === 0 ? (
                <div className="empty-cart">
                  <span>♡</span>
                  <h4>Your order is waiting for you</h4>
                  <p>
                    Add products from our collection to get started.
                  </p>

                  <a href="#collection" className="button button-outline">
                    Explore Collection
                  </a>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map((item) => (
                      <div className="cart-item" key={item.id}>
                        <img src={item.image} alt={item.name} />

                        <div className="cart-item-info">
                          <h4>{item.name}</h4>

                          <p>
                            {Number(item.price).toLocaleString("fr-DZ")} DA / item
                          </p>

                          <div className="quantity-controls">
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQuantity(item.id, -1)
                              }
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>

                            <span>{item.quantity}</span>

                            <button
                              type="button"
                              onClick={() =>
                                updateCartQuantity(item.id, 1)
                              }
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="cart-item-end">
                          <strong>
                            {(
                              Number(item.price) * item.quantity
                            ).toLocaleString("fr-DZ")} DA
                          </strong>

                          <button
                            type="button"
                            className="remove-item"
                            onClick={() => removeFromCart(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="cart-total">
                    <span>Total</span>
                    <strong>
                      {cartTotal.toLocaleString("fr-DZ")} DA
                    </strong>
                  </div>
                </>
              )}
            </div>

            <form className="order-form" onSubmit={handleOrderSubmit}>
              <h3>Customer Information</h3>

              <p className="form-description">
                Fill in your details to prepare your order.
              </p>

              <label htmlFor="customerName">Full Name</label>
              <input
                id="customerName"
                type="text"
                placeholder="Enter your full name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                required
              />

              <label htmlFor="customerPhone">Phone Number</label>
              <input
                id="customerPhone"
                type="tel"
                placeholder="Enter your phone number"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                required
              />

              <label htmlFor="customerMessage">
                Additional Details (optional)
              </label>
              <textarea
                id="customerMessage"
                rows="4"
                placeholder="Colors, names, customization..."
                value={customerMessage}
                onChange={(event) =>
                  setCustomerMessage(event.target.value)
                }
              />

              <button
                type="submit"
                className="button button-primary form-submit"
                disabled={submittingOrder || loadingProducts}
              >
                {submittingOrder
                  ? "Submitting Order..."
                  : "Confirm Order ♡"}
              </button>

              <small className="form-note">
                Your order will be sent to our server.
              </small>
            </form>
          </div>
        </section>

        {/* CONTACT */}
        <section className="contact section-space" id="contact">
          <div className="contact-content">
            <p className="section-kicker">WE'D LOVE TO HEAR FROM YOU</p>

            <h2>
              Have an idea?
              <br />
              <span>Let's make it happen.</span>
            </h2>

            <p className="contact-description">
              Have a question or a special request? Tell us what you have
              in mind.
            </p>

            <div className="contact-detail">
              <span>♡</span>
              <div>
                <strong>Hand Work</strong>
                <p>Sétif, Algeria</p>
              </div>
            </div>

            <div className="contact-detail">
              <span>✧</span>
              <div>
                <strong>Personalized creations</strong>
                <p>Made especially for your occasions</p>
              </div>
            </div>
          </div>

          {isLoggedIn ? (
  <form className="contact-form" onSubmit={handleContactSubmit}>
            <div className="form-heading">
              <span className="form-flower">❀</span>
              <h3>Send Us a Message</h3>
              <p>We'd love to hear your ideas.</p>
            </div>

            <label htmlFor="contactName">Your Name</label>
            <input
              id="contactName"
              type="text"
              placeholder="Your name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              required
            />

            <label htmlFor="contactEmail">Email Address</label>
            <input
              id="contactEmail"
              type="email"
              placeholder="your@email.com"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              required
            />

            <label htmlFor="contactMessage">Your Message</label>
            <textarea
              id="contactMessage"
              rows="5"
              placeholder="Tell us about your idea..."
              value={contactMessage}
              onChange={(event) => setContactMessage(event.target.value)}
              required
            />

            <button
              type="submit"
              className="button button-primary form-submit"
              disabled={submittingContact}
            >
              {submittingContact ? "Sending..." : "Submit Message ↗"}
            </button>

            <small className="form-note">
              Your message will be sent to our server.
            </small>
            </form>
) : (
  <div className="contact-form">
    <div className="form-heading">
      <span className="form-flower">♡</span>
      <h3>Join Hand Work</h3>
      <p>You need to login to send us a message.</p>
    </div>

    <button
      type="button"
      className="button button-primary form-submit"
      onClick={() => setShowUsers(true)}
    >
      Login / Create Account ♡
    </button>
  </div>
)}
        </section>

        {/* FINAL BANNER */}
        <section className="final-banner">
          <span>♡</span>
          <h2>Every detail matters.</h2>
          <p>
            Make your special moments even more beautiful with Hand Work.
          </p>

          <a href="#collection" className="button button-light">
            Discover Our Collection
          </a>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-main">
          <a href="#home" className="footer-brand">
            <img src="/logo.png" alt="Hand Work logo" />

            <div>
              <strong>HAND WORK</strong>
              <small>GIFTS MADE WITH LOVE</small>
            </div>
          </a>

          <p>
            Handmade creations for your
            <br />
            unforgettable moments.
          </p>

          <button
            type="button"
            className="footer-account"
            onClick={() => setShowUsers(true)}
          >
            My Account ♡
          </button>
        </div>

        <div className="footer-links">
          <a href="#home">Home</a>
          <a href="#collection">Collection</a>
          <a href="#about">About</a>
          <a href="#order">Order</a>
          <a href="#contact">Contact</a>
        </div>

        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Hand Work. All rights reserved.
          </span>

          <span>Handcrafted with love, made to make moments special in setif ♡</span>
        </div>
      </footer>

      {/* PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div
          className="product-modal-overlay"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-product-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label="Close product details"
            >
              ×
            </button>

            <img
              src={selectedProduct.image}
              alt={selectedProduct.name}
            />

            <div className="modal-content">
              <span className="product-category">
                {selectedProduct.category}
              </span>

              <h2 id="modal-product-title">
                {selectedProduct.name}
              </h2>

              <p>{selectedProduct.description}</p>

              <strong className="modal-price">
                {Number(selectedProduct.price).toLocaleString("fr-DZ")} DA
              </strong>

              <div className="modal-quantity">
                <span>Quantity</span>

                <div className="quantity-controls">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((previous) => Math.max(1, previous - 1))
                    }
                  >
                    −
                  </button>

                  <span>{quantity}</span>

                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((previous) => previous + 1)
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="button button-primary modal-add-button"
                onClick={() => {
                  addToCart(selectedProduct, quantity);
                  setSelectedProduct(null);
                }}
              >
                Add to Order —{" "}
                {(
                  Number(selectedProduct.price) * quantity
                ).toLocaleString("fr-DZ")} DA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;