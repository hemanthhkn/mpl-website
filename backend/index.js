import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* ------------------------- MYSQL POOL ------------------------- */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

/* ------------------------- MULTER SETUP ------------------------- */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "_" + file.originalname);
  },
});

const upload = multer({ storage });

/* ------------------------- ADMIN LOGIN ------------------------- */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const allowedIp = (req.ip || req.connection.remoteAddress || "").replace(
    "::ffff:",
    ""
  );

  if (allowedIp !== process.env.ADMIN_ALLOWED_IPS) {
    return res.status(403).json({ error: "Access denied for this IP address" });
  }

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({ success: true });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

/* ------------------------- REGISTER API ------------------------- */
app.post(
  "/api/register",
  upload.fields([
    { name: "voterid_image", maxCount: 1 },
    { name: "aadhaar_image", maxCount: 1 },
    { name: "photo", maxCount: 1 },
    { name: "payment_ss", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        name,
        age,
        voterid,
        aadhaar_number,
        jersey_number,
        jersey_size,
        category,
        address,
        phone,
        txn_id,
      } = req.body;

      const voterImage = req.files["voterid_image"]?.[0]?.filename || "";
      const aadhaarImage = req.files["aadhaar_image"]?.[0]?.filename || "";
      const photo = req.files["photo"]?.[0]?.filename || "";
      const payment = req.files["payment_ss"]?.[0]?.filename || "";

      await pool.query(
        `INSERT INTO players 
        (name, age, voterid, voterid_image, aadhaar_number, aadhaar_image, photo,
         jersey_number, jersey_size, category, address, phone, payment_screenshot, txn_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          name,
          age,
          voterid,
          voterImage,
          aadhaarImage,
          photo,
          jersey_number,
          jersey_size,
          category,
          address,
          phone,
          payment,
          txn_id,
        ]
      );

      return res.json({ message: "Registration submitted successfully" });
    } catch (err) {
      console.error("DB Insert Error:", err);
      return res.status(500).json({ error: "Failed to register player" });
    }
  }
);

/* ------------------------- APPROVED PLAYERS ------------------------- */
app.get("/api/approved-players", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, age, category, jersey_size, phone, address, photo 
       FROM players WHERE status='Approved' ORDER BY id DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("Error fetching approved players:", err);
    return res.status(500).json({ error: "Failed to load approved players" });
  }
});

/* ------------------------- REJECTED PLAYERS (NEW) ------------------------- */
app.get("/api/rejected-players", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, category, rejection_reason 
       FROM players WHERE status='Rejected'
       ORDER BY id DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error("Error fetching rejected players:", err);
    return res.status(500).json({ error: "Failed to load rejected players" });
  }
});

/* ------------------------- APPROVE / REJECT ------------------------- */
app.post("/api/admin/approve", async (req, res) => {
  const { id } = req.body;
  await pool.query(`UPDATE players SET status='Approved' WHERE id=?`, [id]);
  return res.json({ success: true });
});

app.post("/api/admin/reject", async (req, res) => {
  const { id, reason } = req.body;
  await pool.query(
    `UPDATE players SET status='Rejected', rejection_reason=? WHERE id=?`,
    [reason, id]
  );
  return res.json({ success: true });
});

/* ------------------------- START SERVER ------------------------- */
app.listen(3001, () => {
  console.log("🚀 MPL Backend running on port 3001");
});
