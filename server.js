const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Tối ưu nén Gzip giúp tải ảnh và giao diện siêu nhanh
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Quản lý phiên đăng nhập mượt mà
app.use(session({
  secret: 'qq88_super_secure_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // Lưu đăng nhập 30 ngày
}));

// 3. Khởi tạo Database SQLite lưu tài khoản & số dư
const db = new sqlite3.Database('./qq88.db', (err) => {
  if (err) console.error("Lỗi kết nối DB:", err.message);
  else console.log("Đã kết nối cơ sở dữ liệu SQLite thành công.");
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    balance INTEGER DEFAULT 58,
    vip INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 4. Phục vụ thư mục tĩnh (ảnh và index.html)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d'
}));

// --- CÁC API TÀI KHOẢN VẬN HÀNH THỰC TẾ ---

// API Đăng ký (Tặng 58K trải nghiệm)
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đủ tên và mật khẩu!' });
  }
  if (username.length < 4) {
    return res.status(400).json({ success: false, message: 'Tên tài khoản tối thiểu 4 ký tự!' });
  }

  const query = `INSERT INTO users (username, password, balance, vip) VALUES (?, ?, 58, 0)`;
  db.run(query, [username.trim(), password.trim()], function(err) {
    if (err) {
      return res.status(400).json({ success: false, message: 'Tên tài khoản này đã có người đăng ký!' });
    }
    req.session.user = { id: this.lastID, username: username.trim(), balance: 58, vip: 0 };
    res.json({ success: true, message: 'Đăng ký thành công! +58K vào ví cược', user: req.session.user });
  });
});

// API Đăng nhập
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const query = `SELECT id, username, balance, vip FROM users WHERE username = ? AND password = ?`;
  db.get(query, [username.trim(), password.trim()], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
    req.session.user = row;
    res.json({ success: true, message: 'Đăng nhập thành công!', user: row });
  });
});

// API Kiểm tra phiên đăng nhập (Mỗi lần mở lại web)
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ loggedIn: false });
  }
  // Lấy dữ liệu mới nhất từ DB
  db.get(`SELECT username, balance, vip FROM users WHERE id = ?`, [req.session.user.id], (err, row) => {
    if (row) {
      res.json({ loggedIn: true, user: row });
    } else {
      res.json({ loggedIn: false });
    }
  });
});

// API Đăng xuất
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Định tuyến về file index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Server mượt mà đang chạy trên cổng ${PORT}`);
});
