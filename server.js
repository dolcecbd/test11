const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'qq88_super_secure_production_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

const DB_FILE = path.join(__dirname, 'users_data.json');
const GAME_CONFIG_FILE = path.join(__dirname, 'games_config.json');

const DEFAULT_GAMES = {
  "slot-caoboi": { name: "Quyết Chiến Tiền Thưởng", win_rate: 0.35, min_bet: 10000, symbols: ["🤠", "🔫", "🥃", "💰", "🎩", "⭐"] },
  "banca-jackpot": { name: "Jackpot Đánh Cá", win_rate: 0.40, min_bet: 5000, symbols: ["🦈", "🐠", "🐙", "🦀", "🐳", "🔱"] },
  "gamebai-taixiu": { name: "Tài Xỉu V8", win_rate: 0.48, min_bet: 10000, symbols: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] }
};

function readData(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (e) {
    return fallback;
  }
}

function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Lỗi ghi file:", e);
  }
}

function ensureAdminExists() {
  const users = readData(DB_FILE, {});
  if (!users["admin"]) {
    users["admin"] = {
      username: "admin",
      password: "admin888",
      role: "admin",
      balance: 99999999,
      custom_win_rate: null,
      bank_name: "ACB",
      bank_account: "88888888",
      bank_owner: "ADMIN ROOT",
      bank_locked: true,
      withdraw_password: "888",
      vip: 10,
      created_at: new Date().toISOString()
    };
    saveData(DB_FILE, users);
  }
}
ensureAdminExists();

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: "Không có quyền quản trị!" });
}

// 1. ROUTE ĐIỀU HƯỚNG SẢNH VÀ GAME
app.get('/', (req, res) => {
  const user = req.session.user || null;
  res.render('index', { 
    user: user,
    username: user ? user.username : 'quanmi112',
    balance: user ? user.balance : 0,
    isAdmin: user && user.role === 'admin'
  });
});

// ROUTE CỔNG CHUYỂN HƯỚNG XOAY LOADING VÔ TẬN (ĐẠI LÝ & GIỚI THIỆU)
app.get('/loading-gateway', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>QQ88 - Đang Kết Nối Cổng Hệ Thống</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #004d25;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #ffffff;
        }
        .gateway-card {
          width: 90%;
          max-width: 360px;
          background: rgba(0, 90, 43, 0.85);
          border: 1.5px solid #ffde00;
          border-radius: 16px;
          padding: 35px 20px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 222, 0, 0.25);
          border-top-color: #ffde00;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .title {
          font-size: 18px;
          font-weight: 800;
          color: #ffde00;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }
        .desc {
          font-size: 13px;
          color: #d1fae5;
          line-height: 1.5;
        }
        .btn-back {
          display: inline-block;
          margin-top: 25px;
          padding: 8px 24px;
          background: #ffffff;
          color: #005a2b;
          font-size: 12.5px;
          font-weight: 800;
          border-radius: 20px;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="gateway-card">
        <div class="spinner"></div>
        <div class="title">ĐANG KẾT NỐI HỆ THỐNG</div>
        <div class="desc">Hệ thống đang đồng bộ dữ liệu cổng liên kết bảo mật. Vui lòng chờ trong giây lát...</div>
        <a href="/" class="btn-back">Quay về sảnh</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/game/:gameCode', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  const gameCode = req.params.gameCode;
  const games = readData(GAME_CONFIG_FILE, DEFAULT_GAMES);
  const gameInfo = games[gameCode] || {
    name: gameCode.toUpperCase().replace(/-/g, ' '),
    min_bet: 5000,
    win_rate: 0.30,
    symbols: ["🎰", "💎", "7️⃣", "🍒", "🔔", "⭐"]
  };

  const users = readData(DB_FILE);
  const currentUser = users[req.session.user.username] || req.session.user;

  res.render('game-slot', {
    game_code: gameCode,
    game_name: gameInfo.name,
    balance: currentUser.balance,
    min_bet: gameInfo.min_bet,
    symbols: JSON.stringify(gameInfo.symbols)
  });
});

// 2. API TÀI KHOẢN, LIÊN KẾT NGÂN HÀNG & NẠP RÚT
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  const users = readData(DB_FILE);
  const u = req.session.user.username;
  if (users[u]) {
    req.session.user = users[u];
    return res.json({ loggedIn: true, user: users[u] });
  }
  res.json({ loggedIn: false });
});

app.post('/api/register', (req, res) => {
  const { username, password, fullname, phone } = req.body;
  const u = (username || '').trim();
  const p = (password || '').trim();
  const fn = (fullname || '').trim();
  const ph = (phone || '').trim();

  if (u.length < 4 || !p) {
    return res.status(400).json({ success: false, message: 'Tài khoản tối thiểu 4 ký tự!' });
  }

  const users = readData(DB_FILE);
  if (users[u]) {
    return res.status(400).json({ success: false, message: 'Tài khoản đã tồn tại!' });
  }

  users[u] = {
    username: u,
    password: p,
    fullname: fn,
    phone: ph,
    role: "user",
    balance: 0,
    custom_win_rate: null,
    bank_name: "",
    bank_account: "",
    bank_owner: fn ? fn.toUpperCase() : u.toUpperCase(),
    withdraw_password: "",
    bank_locked: false,
    vip: 0,
    created_at: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  };
  saveData(DB_FILE, users);

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng ký thành công!', user: users[u] });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = (username || '').trim();
  const p = (password || '').trim();

  const users = readData(DB_FILE);
  if (!users[u] || users[u].password !== p) {
    return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
  }

  if (u === 'admin') {
    users[u].role = 'admin';
    if (!users[u].balance) users[u].balance = 99999999;
    saveData(DB_FILE, users);
  }

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng nhập thành công!', user: users[u] });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// LIÊN KẾT THẺ NGÂN HÀNG & KHÓA BẢO MẬT VĨNH VIỄN
app.post('/api/user/bind-bank', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });

  const { bank_name, bank_account, withdraw_password } = req.body;
  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];

  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });

  // Kiểm tra khóa bảo mật
  if (user.bank_locked) {
    return res.status(403).json({ 
      success: false, 
      message: 'Tài khoản ngân hàng đã được khóa bảo mật vĩnh viễn. Vui lòng liên hệ CSKH/Admin để chỉnh sửa!' 
    });
  }

  if (!bank_name || !bank_account || !withdraw_password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin!' });
  }

  user.bank_name = bank_name;
  user.bank_account = bank_account;
  user.withdraw_password = withdraw_password;
  user.bank_locked = true; // Khóa thẻ vĩnh viễn

  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({ success: true, message: 'Liên kết ngân hàng và khóa bảo mật thành công!', user });
});

app.post('/api/deposit', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  const amount = Number(req.body.amount || 0);
  if (amount <= 0) return res.status(400).json({ success: false, message: 'Số tiền nạp không hợp lệ!' });

  const users = readData(DB_FILE);
  const u = req.session.user.username;

  if (users[u]) {
    users[u].balance = (users[u].balance || 0) + amount;
    saveData(DB_FILE, users);
    req.session.user = users[u];
    return res.json({ status: 'success', new_balance: users[u].balance });
  }
  res.status(404).json({ success: false });
});

// API TỰ ĐỘNG KHÔI PHỤC DỮ LIỆU TỪ TRÌNH DUYỆT KHI SERVER RESTART
app.post('/api/sync-backup', (req, res) => {
  const { user } = req.body;
  if (!user || !user.username || !user.password) {
    return res.json({ success: false });
  }

  const users = readData(DB_FILE);
  const u = user.username.trim();

  if (!users[u]) {
    users[u] = {
      username: u,
      password: user.password,
      fullname: user.fullname || "",
      phone: user.phone || "",
      role: user.role || "user",
      balance: Number(user.balance || 0),
      custom_win_rate: user.custom_win_rate || null,
      bank_name: user.bank_name || "",
      bank_account: user.bank_account || "",
      bank_owner: user.bank_owner || (user.fullname ? user.fullname.toUpperCase() : u.toUpperCase()),
      withdraw_password: user.withdraw_password || "",
      bank_locked: user.bank_locked || false,
      vip: user.vip || 0,
      created_at: user.created_at || new Date().toISOString()
    };
    saveData(DB_FILE, users);
  }

  req.session.user = users[u];
  res.json({ success: true, user: users[u] });
});

// 3. API ĐẶT CƯỢC & THUẬT TOÁN KẾT QUẢ GAME
app.post('/api/play/:gameCode', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Chưa đăng nhập!" });

  const gameCode = req.params.gameCode;
  const games = readData(GAME_CONFIG_FILE, DEFAULT_GAMES);
  const gameInfo = games[gameCode] || { win_rate: 0.30, min_bet: 5000 };

  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];

  if (!user) return res.status(404).json({ error: "Tài khoản không tồn tại!" });

  const betAmount = parseInt(req.body.bet_amount) || gameInfo.min_bet;

  if (user.balance < betAmount) {
    return res.status(400).json({ 
      error: "Số dư không đủ! Vui lòng quay ra sảnh nạp thêm tiền để tiếp tục.",
      current_balance: user.balance 
    });
  }

  user.balance -= betAmount;

  let activeWinRate = (user.custom_win_rate !== null && user.custom_win_rate !== undefined) 
                        ? Number(user.custom_win_rate) 
                        : Number(gameInfo.win_rate || 0.35);

  const isWin = Math.random() < activeWinRate;
  let winAmount = 0;
  let multiplier = 1;

  if (isWin) {
    multiplier = [2, 3, 5, 10][Math.floor(Math.random() * 4)];
    winAmount = betAmount * multiplier;
    user.balance += winAmount;
  }

  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({
    status: "success",
    is_win: isWin,
    multiplier: multiplier,
    win_amount: winAmount,
    new_balance: user.balance,
    msg: isWin ? `NỔ HŨ X${multiplier}! Nhận +${winAmount.toLocaleString('vi-VN')} đ` : "Chúc bạn may mắn lần sau!"
  });
});

// 4. BỘ API ADMIN (QUẢN TRỊ VIÊN ĐẶC QUYỀN)
app.post('/api/admin/set-balance', requireAdmin, (req, res) => {
  const { targetUsername, mode, amount } = req.body;
  const users = readData(DB_FILE);

  if (!users[targetUsername]) {
    return res.status(404).json({ success: false, message: "Không tìm thấy người chơi!" });
  }

  const num = Number(amount || 0);
  if (mode === 'add') users[targetUsername].balance += num;
  else if (mode === 'subtract') users[targetUsername].balance = Math.max(0, users[targetUsername].balance - num);
  else if (mode === 'set') users[targetUsername].balance = num;

  saveData(DB_FILE, users);
  res.json({ success: true, message: `Đã chỉnh số dư ${targetUsername} thành ${users[targetUsername].balance.toLocaleString('vi-VN')} đ` });
});

app.post('/api/admin/set-user-bank', requireAdmin, (req, res) => {
  const { targetUsername, bank_name, bank_account, bank_owner, new_password } = req.body;
  const users = readData(DB_FILE);

  if (!users[targetUsername]) {
    return res.status(404).json({ success: false, message: "Không tìm thấy người chơi!" });
  }

  if (bank_name) users[targetUsername].bank_name = bank_name;
  if (bank_account) users[targetUsername].bank_account = bank_account;
  if (bank_owner) users[targetUsername].bank_owner = bank_owner;
  if (new_password) users[targetUsername].password = new_password;

  // Cho phép Admin mở khóa hoặc đặt lại thẻ
  users[targetUsername].bank_locked = false;

  saveData(DB_FILE, users);
  res.json({ success: true, message: `Đã cập nhật thông tin Profile cho ${targetUsername} thành công!` });
});

app.post('/api/admin/set-user-rtp', requireAdmin, (req, res) => {
  const { targetUsername, rate } = req.body;
  const users = readData(DB_FILE);

  if (!users[targetUsername]) {
    return res.status(404).json({ success: false, message: "Không tìm thấy người chơi!" });
  }

  users[targetUsername].custom_win_rate = (rate === 'default' || rate === '' || rate === null) ? null : Number(rate);
  saveData(DB_FILE, users);
  res.json({ success: true, message: `Đã cập nhật tỉ lệ riêng cho ${targetUsername}` });
});

app.post('/api/admin/set-game-rtp', requireAdmin, (req, res) => {
  const { gameCode, win_rate } = req.body;
  const games = readData(GAME_CONFIG_FILE, DEFAULT_GAMES);

  if (!games[gameCode]) {
    games[gameCode] = { name: gameCode, win_rate: 0.35, min_bet: 5000 };
  }

  games[gameCode].win_rate = Number(win_rate);
  saveData(GAME_CONFIG_FILE, games);
  res.json({ success: true, message: `Đã cập nhật tỉ lệ nổ game ${gameCode} thành ${Number(win_rate) * 100}%` });
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Khởi động thành công trên cổng ${PORT}`);
});
