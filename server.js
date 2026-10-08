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
  secret: 'qq88_super_secure_production_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 }
}));

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

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// 1. API Đăng ký (Số dư ban đầu = 0, không tặng trước)
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

  users[u] = {
    username: u,
    password: p,
    balance: 0,
    vip: 0,
    created_at: new Date().toISOString()
  };
  saveUsers(users);

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng ký tài khoản thành công!', user: users[u] });
});

// 2. API Đăng nhập
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

// 3. API Cập nhật / Nạp rút số dư tài khoản theo thời gian thực
app.post('/api/update-balance', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  }
  const { amount } = req.body;
  const users = readUsers();
  const u = req.session.user.username;

  if (users[u]) {
    users[u].balance = Math.max(0, (users[u].balance || 0) + Number(amount || 0));
    saveUsers(users);
    req.session.user = users[u];
    return res.json({ success: true, balance: users[u].balance });
  }
  res.status(404).json({ success: false });
});

// 4. API Đồng bộ dữ liệu backup
app.post('/api/sync-backup', (req, res) => {
  const { user } = req.body;
  if (user && user.username && user.password) {
    const users = readUsers();
    if (!users[user.username]) {
      users[user.username] = {
        username: user.username,
        password: user.password,
        balance: Number(user.balance || 0),
        vip: 0,
        created_at: new Date().toISOString()
      };
      saveUsers(users);
    }
    req.session.user = users[user.username];
    return res.json({ success: true, user: users[user.username] });
  }
  res.json({ success: false });
});

// 5. API Kiểm tra phiên
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

// 6. API Đăng xuất
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Server dang chay tren cong ${PORT}`);
});
