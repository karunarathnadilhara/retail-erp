const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./database");

const app = express();
app.use(express.json());

const JWT_SECRET = "change-this-secret-later";

// ---------- MIDDLEWARE ----------

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "token required" });
  }
  try {
    req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "access denied" });
    }
    next();
  };
}

app.get("/", (req, res) => {
  res.json({ message: "Retail ERP API is running" });
});

// ---------- AUTH ----------

app.post("/auth/register", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  const userRole = role === "admin" ? "admin" : "cashier";
  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db
      .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)")
      .run(username, hashed, userRole);
    res.status(201).json({ id: result.lastInsertRowid, username, role: userRole });
  } catch (err) {
    res.status(409).json({ error: "username already exists" });
  }
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password || "", user.password)) {
    return res.status(401).json({ error: "invalid username or password" });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token, role: user.role });
});

// ---------- PRODUCTS ----------

app.get("/products", authenticate, (req, res) => {
  const products = db.prepare("SELECT * FROM products").all();
  res.json(products);
});

app.post("/products", authenticate, requireRole("admin"), (req, res) => {
  const { name, price, stock } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: "name and price are required" });
  }
  const result = db
    .prepare("INSERT INTO products (name, price, stock) VALUES (?, ?, ?)")
    .run(name, price, stock || 0);
  res.status(201).json({ id: result.lastInsertRowid, name, price, stock: stock || 0 });
});

// ---------- SALES ----------

app.post("/sales", authenticate, (req, res) => {
  const { items } = req.body; // [{ product_id, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const createSale = db.transaction(() => {
    let total = 0;
    const lines = [];

    for (const item of items) {
      const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(item.product_id);
      if (!product) {
        throw new Error(`product ${item.product_id} not found`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("quantity must be a positive whole number");
      }
      if (product.stock < item.quantity) {
        throw new Error(`not enough stock for ${product.name}`);
      }
      total += product.price * item.quantity;
      lines.push({ product, quantity: item.quantity });
    }

    const sale = db
      .prepare("INSERT INTO sales (user_id, total) VALUES (?, ?)")
      .run(req.user.id, total);

    for (const line of lines) {
      db.prepare(
        "INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)"
      ).run(sale.lastInsertRowid, line.product.id, line.quantity, line.product.price);
      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(
        line.quantity,
        line.product.id
      );
    }

    return { id: sale.lastInsertRowid, total };
  });

  try {
    res.status(201).json(createSale());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});