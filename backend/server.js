const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./database");

const app = express();
app.use(express.json());

const JWT_SECRET = "change-this-secret-later";

// ---------- MIDDLEWARE ----------

// Login වෙලාද බලන්න
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

// Role එක හරිද බලන්න
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

// Login වුණ ඕනම කෙනෙකුට
app.get("/products", authenticate, (req, res) => {
  const products = db.prepare("SELECT * FROM products").all();
  res.json(products);
});

// Admin ට විතරයි
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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});