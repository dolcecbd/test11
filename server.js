const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'qq88_super_secure_key_production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 } // Nhớ đăng nhập 1 năm
}));

// File dữ liệu lưu người dùng (dạng JSON nhẹ, đọc ghi siêu tốc)
const DB_FILE = path.join(__dirname, 'users_data.json');

function readUsers() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '{}');
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Lỗi ghi file:", e);
  }
}

// Phục vụ thư mục tĩnh
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// 1. API Đăng ký tài khoản
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đủ tên và mật khẩu!' });
  }
  const u = username.trim();
  const p = password.trim();

  if (u.length < 4) {
    return res.status(400).json({ success: false, message: 'Tên tài khoản tối thiểu 4 ký tự!' });
  }

  const users = readUsers();
  if (users[u]) {
    return res.status(400).json({ success: false, message: 'Tài khoản này đã tồn tại!' });
  }

  // Tạo tài khoản mới & cộng ngay 58K
  users[u] = {
    username: u,
    password: p,
    balance: 58,
    vip: 0,
    created_at: new Date().toISOString()
  };
  saveUsers(users);

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng ký thành công! +58K vào ví', user: users[u] });
});

// 2. API Đăng nhập (Hôm nay hay ngày mai vào vẫn dùng mật khẩu này)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = (username || '').trim();
  const p = (password || '').trim();

  const users = readUsers();
  if (!users[u] || users[u].password !== p) {
    return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
  }

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng nhập thành công!', user: users[u] });
});

// 3. API Đồng bộ tài khoản từ thiết bị (Phòng trường hợp Render restart xóa cache)
app.post('/api/sync-backup', (req, res) => {
  const { user } = req.body;
  if (user && user.username && user.password) {
    const users = readUsers();
    if (!users[user.username]) {
      users[user.username] = user;
      saveUsers(users);
    }
    req.session.user = users[user.username];
    return res.json({ success: true, user: users[user.username] });
  }
  res.json({ success: false });
});

// 4. API Lấy thông tin phiên hiện tại
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ loggedIn: false });
  }
  const users = readUsers();
  const u = req.session.user.username;
  if (users[u]) {
    return res.json({ loggedIn: true, user: users[u] });
  }
  res.json({ loggedIn: false });
});

// 5. API Đăng xuất
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Dang chay tren cong ${PORT}`);
});
