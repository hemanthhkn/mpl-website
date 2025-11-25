import multer from "multer";
import path from "path";
import express from "express";
import mysql from "mysql2";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

// 🧩 Multer storage setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = "photos";

    if (file.fieldname === "voterid_image") {
      folder = "voter";
    } else if (file.fieldname === "aadhaar_image") {
      folder = "aadhaar";
    } else if (file.fieldname === "payment_ss") {
      folder = "payments";
    } else if (file.fieldname === "photo") {
      folder = "photos";
    }

    cb(null, `/var/www/mpl/uploads/${folder}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${unique}${ext}`);
  },
});

// Allow only image files
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


const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

// ✅ Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "hemanth",
  password: "Virat@1845",
  database: "mpl_tournament"
});

db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL database");
  }
});

// ✅ Health Check route
app.get("/health", (req, res) => {
  res.json({ status: "Server running fine 💪" });
});

// 📝 Player Registration API
app.post(
  "/register",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "voterid_image", maxCount: 1 },
    { name: "aadhaar_image", maxCount: 1 },
    { name: "payment_ss", maxCount: 1 },
  ]),
  (req, res) => {
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
        (name, age, category, phone, address, jersey_number, jersey_size, voterid, voterid_image, aadhaar_number, aadhaar_image, photo, payment_ss, txn_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `;
      db.query(
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

            // Duplicate entry handling
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
  }
);

// ✅ Get approved players (for frontend table)
app.get("/approved-players", (req, res) => {
  const sql = `
    SELECT id, name, age, jersey_size, category, phone, address, photo
    FROM players
    WHERE status = 'Approved'
    ORDER BY id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching approved players:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});





// ✅ Start server
app.listen(3001, () => {
  console.log("🚀 MPL Backend running on port 3001");
});
