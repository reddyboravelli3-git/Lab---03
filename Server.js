
const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let db;

// Connect to database and create table
async function initializeDatabase() {
  db = await open({
    filename: "./database.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price REAL NOT NULL,
      pages INTEGER DEFAULT 0
    )
  `);

  console.log("Database connected successfully");
}

// GET /books - Get all books with search, sorting and filters
app.get("/books", async (req, res) => {
  try {
    const {
      search_q = "",
      order_by = "id",
      order = "ASC",
      limit = "10",
      offset = "0",
      min_price,
      max_price
    } = req.query;

    // Validate sorting column
    const allowedColumns = ["id", "title", "author", "price"];

    if (!allowedColumns.includes(order_by)) {
      return res.status(400).json({
        message: "Invalid order_by. Use id, title, author or price."
      });
    }

    // Validate sorting order
    const sortOrder = order.toUpperCase();

    if (!["ASC", "DESC"].includes(sortOrder)) {
      return res.status(400).json({
        message: "Order must be ASC or DESC."
      });
    }

    // Validate limit and offset
    const limitValue = Number(limit);
    const offsetValue = Number(offset);

    if (
      !Number.isInteger(limitValue) ||
      limitValue <= 0 ||
      !Number.isInteger(offsetValue) ||
      offsetValue < 0
    ) {
      return res.status(400).json({
        message: "Limit must be positive and offset must be zero or greater."
      });
    }

    // Validate price filters
    let minPriceValue;
    let maxPriceValue;

    if (min_price !== undefined) {
      minPriceValue = Number(min_price);

      if (!Number.isFinite(minPriceValue) || minPriceValue < 0) {
        return res.status(400).json({
          message: "min_price must be a valid non-negative number."
        });
      }
    }

    if (max_price !== undefined) {
      maxPriceValue = Number(max_price);

      if (!Number.isFinite(maxPriceValue) || maxPriceValue < 0) {
        return res.status(400).json({
          message: "max_price must be a valid non-negative number."
        });
      }
    }

    if (
      minPriceValue !== undefined &&
      maxPriceValue !== undefined &&
      minPriceValue > maxPriceValue
    ) {
      return res.status(400).json({
        message: "min_price cannot be greater than max_price."
      });
    }

    // Build safe SQL query
    let sql = "SELECT * FROM book WHERE 1=1";
    const params = [];

    // Search books by partial title
    if (search_q.trim() !== "") {
      sql += " AND title LIKE ?";
      params.push(`%${search_q.trim()}%`);
    }

    // Minimum price filter
    if (minPriceValue !== undefined) {
      sql += " AND price >= ?";
      params.push(minPriceValue);
    }

    // Maximum price filter
    if (maxPriceValue !== undefined) {
      sql += " AND price <= ?";
      params.push(maxPriceValue);
    }

    // Sorting and pagination
    sql += ` ORDER BY ${order_by} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limitValue, offsetValue);

    const books = await db.all(sql, params);

    return res.status(200).json({
      message: "Books retrieved successfully",
      count: books.length,
      books: books
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// GET /books/:id - Get a single book
app.get("/books/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    const book = await db.get(
      "SELECT * FROM book WHERE id = ?",
      [id]
    );

    if (!book) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    return res.status(200).json({
      message: "Book retrieved successfully",
      book: book
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// POST /books - Add a new book
app.post("/books", async (req, res) => {
  try {
    const { title, author, price, pages = 0 } = req.body;

    // Validate required fields
    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      typeof author !== "string" ||
      author.trim() === "" ||
      price === undefined ||
      price === null ||
      price === "" ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return res.status(400).json({
        message: "Title, author and a valid non-negative numeric price are required."
      });
    }

    if (
      !Number.isInteger(pages) ||
      pages < 0
    ) {
      return res.status(400).json({
        message: "Pages must be a non-negative integer."
      });
    }

    const result = await db.run(
      `INSERT INTO book (title, author, price, pages)
       VALUES (?, ?, ?, ?)`,
      [title.trim(), author.trim(), price, pages]
    );

    return res.status(201).json({
      message: "Book added successfully",
      bookId: result.lastID
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// PUT /books/:id - Update a book
app.put("/books/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, author, price, pages } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      typeof author !== "string" ||
      author.trim() === "" ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(pages) ||
      pages < 0
    ) {
      return res.status(400).json({
        message: "Valid title, author, numeric price and pages are required."
      });
    }

    const existingBook = await db.get(
      "SELECT * FROM book WHERE id = ?",
      [id]
    );

    if (!existingBook) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    await db.run(
      `UPDATE book
       SET title = ?, author = ?, price = ?, pages = ?
       WHERE id = ?`,
      [title.trim(), author.trim(), price, pages, id]
    );

    return res.status(200).json({
      message: "Book updated successfully"
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// DELETE /books/:id - Delete a book
app.delete("/books/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "Invalid book ID."
      });
    }

    const existingBook = await db.get(
      "SELECT * FROM book WHERE id = ?",
      [id]
    );

    if (!existingBook) {
      return res.status(404).json({
        message: "Book not found."
      });
    }

    await db.run(
      "DELETE FROM book WHERE id = ?",
      [id]
    );

    return res.status(200).json({
      message: "Book deleted successfully"
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found."
  });
});

// Start server after database initialization
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
}

startServer();
