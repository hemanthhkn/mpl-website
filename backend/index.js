import multer from "multer";
import path from "path";
import express from "express";
import mysql from "mysql2";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

// ===================== MULTER (FILE UPLOADS) =====================

// Always use ONE folder: /var/www/mpl/uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "/var/www/mpl/uploads");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
});

// ===================== EXPRESS APP & DB =====================

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
// Serve uploaded images statically
app.use("/uploads", express.static("/var/www/mpl/uploads"));

// MySQL pool
const pool = mysql.createPool({
  host: "localhost",
  user: "hemanth",
  password: "Virat@1845",
  database: "mpl_tournament",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Log DB connectivity once
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection pool failed:", err);
  } else {
    console.log("✅ Connected to MySQL database (pool)");
    connection.release();
  }
});

// ===================== BASIC ROUTES =====================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "Server running fine 💪" });
});

// ===================== PLAYER REGISTRATION =====================

const registrationHandler = (req, res) => {
  try {
    const {
      name,
      age,
      category,
      phone,
      address,
      jersey_number,
      jersey_size,
      voterid,
      aadhaar_number,
      txn_id,
    } = req.body;

    const files = req.files || {};

    const photo = files.photo?.[0]?.filename || null;
    const voterid_image = files.voterid_image?.[0]?.filename || null;
    const aadhaar_image = files.aadhaar_image?.[0]?.filename || null;
    const payment_ss = files.payment_ss?.[0]?.filename || null;

    const sql = `
      INSERT INTO players
      (name, age, category, phone, address,
       jersey_number, jersey_size,
       voterid, voterid_image,
       aadhaar_number, aadhaar_image,
       photo, payment_ss,
       txn_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    pool.query(
      sql,
      [
        name,
        age,
        category,
        phone,
        address,
        jersey_number,
        jersey_size,
        voterid,
        voterid_image,
        aadhaar_number,
        aadhaar_image,
        photo,
        payment_ss,
        txn_id,
      ],
      (err, result) => {
        if (err) {
          console.error("❌ DB Insert Error:", err);

          if (err.code === "ER_DUP_ENTRY") {
            let msg = "Duplicate entry – already registered.";

            if (err.message.includes("aadhaar_number")) {
              msg = "This Aadhaar number is already registered.";
            } else if (err.message.includes("voterid")) {
              msg = "This Voter ID is already registered.";
            } else if (err.message.includes("txn_id")) {
              msg = "This Transaction ID is already used.";
            }

            return res.status(400).json({ error: msg });
          }

          return res.status(500).json({ error: "Database error" });
        }

        res.json({ message: "Registration submitted successfully!" });
      }
    );
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
};

const uploadFields = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "voterid_image", maxCount: 1 },
  { name: "aadhaar_image", maxCount: 1 },
  { name: "payment_ss", maxCount: 1 },
]);

app.post("/register", uploadFields, registrationHandler);
app.post("/api/register", uploadFields, registrationHandler);

// ===================== PUBLIC: APPROVED PLAYERS =====================

app.get("/api/approved-players", (req, res) => {
  const sql = `
    SELECT id, name, age, jersey_size, category, phone, address, photo
    FROM players
    WHERE status = 'Approved'
    ORDER BY id  ASC
  `;

  pool.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching approved players (API):", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// ===================== ADMIN LOGIN =====================

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "Virat@1845") {
    return res.json({ success: true });
  }

  return res.status(401).json({ error: "Invalid username or password" });
});

// ===================== ADMIN: PENDING REGISTRATIONS =====================

app.get("/api/admin/pending-registrations", (req, res) => {
  const sql = `
    SELECT
      id,
      name,
      age,
      jersey_size,
      category,
      phone,
      address,
      photo,
      voterid_image,
      aadhaar_image,
      payment_ss,
 txn_id
    FROM players
    WHERE status = 'PENDING'
    ORDER BY id DESC
  `;

  pool.query(sql, (err, rows) => {
    if (err) {
      console.error("Error fetching pending registrations:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.post("/api/admin/approve/:id", (req, res) => {
  const id = req.params.id;

  const sql = `UPDATE players SET status = 'Approved' WHERE id = ?`;

  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error approving player:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json({ success: true });
  });
});

app.post("/api/admin/reject/:id", (req, res) => {
  const id = req.params.id;

  const sql = `DELETE FROM players WHERE id = ? AND status = 'PENDING'`;

  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error rejecting player:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Pending player not found" });
    }

    res.json({ success: true });
  });
});

// ===================== ADMIN: APPROVED PLAYERS (VIEW + DELETE) =====================

app.get("/api/admin/approved-players", (req, res) => {
  const sql = `
    SELECT id, name, age, jersey_size, category, phone, address, photo
    FROM players
    WHERE status = 'Approved'
    ORDER BY id  asc
  `;

  pool.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching admin approved players:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

app.delete("/api/admin/approved-players/:id", (req, res) => {
  const id = req.params.id;

  const sql = `DELETE FROM players WHERE id = ? AND status = 'Approved'`;

  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Error deleting approved player:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Approved player not found" });
    }

    res.json({ success: true });
  });
});

// ===================== START SERVER =====================

app.listen(3001, () => {
  console.log("🚀 MPL Backend running on port 3001");
});
