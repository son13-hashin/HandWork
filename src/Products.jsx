import { useNavigate, useSearchParams } from "react-router-dom";

const products = [
  {
    id: 1,
    name: "Graduation Gift",
    category: "Graduation Gifts",
    description: "A special gift to celebrate success.",
    image: "/images/grad.jpg",
  },
  {
    id: 2,
    name: "Graduation Keepsake",
    category: "Graduation Gifts",
    description: "A beautiful memory of an important day.",
    image: "/images/grad.jpg",
  },
  {
    id: 3,
    name: "Bride Favor",
    category: "Bride Favors",
    description: "Elegant favors for your special celebration.",
    image: "/images/wedding.jpg",
  },
  {
    id: 4,
    name: "Wedding Keepsake",
    category: "Bride Favors",
    description: "A lovely detail to share with your guests.",
    image: "/images/wedding.jpg",
  },
  {
    id: 5,
    name: "Personalized Sticker",
    category: "Personalized Stickers",
    description: "Personalized details for every occasion.",
    image: "/images/stickers.jpg",
  },
  {
    id: 6,
    name: "Custom Sticker Set",
    category: "Personalized Stickers",
    description: "A little touch that makes it yours.",
    image: "/images/stickers.jpg",
  },
  {
    id: 7,
    name: "Luxury Gift Box",
    category: "Gift Boxes",
    description: "A beautiful box for a thoughtful gift.",
    image: "/images/boxes.jpg",
  },
  {
    id: 8,
    name: "Personalized Gift Box",
    category: "Gift Boxes",
    description: "A special presentation for special moments.",
    image: "/images/boxes.jpg",
  },
];

function Products() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedCategory = searchParams.get("category");

  const filteredProducts = selectedCategory
    ? products.filter(
        (product) => product.category === selectedCategory
      )
    : products;

  return (
    <div className="products-page">

      {/* HEADER */}
      <header className="products-navbar">
        <button
          className="back-button"
          onClick={() => navigate("/#collection")}
        >
          ← Back to Home
        </button>

        <a href="/" className="brand">
          <span className="brand-icon">H</span>

          <span className="brand-text">
            <strong>HAND WORK</strong>
            <small>LUXURY BOUTIQUE</small>
          </span>
        </a>

        <span className="products-header-note">
          MADE WITH LOVE ♡
        </span>
      </header>

      {/* PAGE INTRODUCTION */}
      <section className="products-intro">
        <div className="section-label">HAND WORK COLLECTION</div>

        <h1>
          {selectedCategory || "Our Creations"}
        </h1>

        <p>
          Discover thoughtful creations made for your special moments.
        </p>

        <span className="products-count">
          {filteredProducts.length} CREATIONS
        </span>
      </section>

      {/* PRODUCTS */}
      <section className="products-content">
        {filteredProducts.length > 0 ? (
          <div className="products-grid">
            {filteredProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  <img
                    src={product.image}
                    alt={product.name}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span className="product-number">
                    {String(product.id).padStart(2, "0")}
                  </span>
                </div>

                <div className="product-info">
                  <span className="product-category">
                    {product.category}
                  </span>

                  <h2>{product.name}</h2>

                  <p>{product.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-products">
            <span>♡</span>

            <h2>No creations found</h2>

            <p>
              This collection is not available yet.
              Explore our other collections.
            </p>

            <button
              className="primary-button"
              onClick={() => navigate("/products")}
            >
              View All Creations →
            </button>
          </div>
        )}

        <div className="products-bottom">
          <button
            className="outline-button"
            onClick={() => navigate("/products")}
          >
            View All Collections
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer products-footer">
        <a href="/" className="footer-brand">
          HAND WORK <span>♡</span>
        </a>

        <p>Little creations, made with love.</p>

        <div className="footer-bottom">
          © 2026 Hand Work. All rights reserved.
        </div>
      </footer>

    </div>
  );
}

export default Products;