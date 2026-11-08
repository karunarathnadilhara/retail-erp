const express = require("express");
const db = require("./database");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Retail ERP API is running" });
});

app.get("/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products").all();
  res.json(products);
});


app.post("/products", (req, res) => {
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