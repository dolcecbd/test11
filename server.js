const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình View Engine EJS
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

// Phục vụ ảnh và file tĩnh từ public
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// ==========================================
// QUẢN LÝ DỮ LIỆU TỰ ĐỘNG (JSON STORAGE)
// ==========================================
const DB_FILE = path.join(__dirname, 'users_data.json');
const GAME_CONFIG_FILE = path.join(__dirname, 'games_config.json');

// Khởi tạo danh sách game mặc định nếu chưa có
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

// Tự động tạo tài khoản Admin gốc nếu chưa tồn tại
function ensureAdminExists() {
  const users = readData(DB_FILE, {});
  if (!users["admin"]) {
    users["admin"] = {
      username: "admin",
      password: "admin888", // Mật khẩu admin mặc định
      role: "admin",
      balance: 99999999,
      custom_win_rate: null,
      vip: 10,
      created_at: new Date().toISOString()
    };
    saveData(DB_FILE, users);
  }
}
ensureAdminExists();

// Middleware kiểm tra quyền Quản trị
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: "Không có quyền quản trị!" });
}

// ==========================================
// 1. ROUTE ĐIỀU HƯỚNG GIAO DIỆN
// ==========================================

// Sảnh chính
app.get('/', (req, res) => {
  const user = req.session.user || null;
  res.render('index', { 
    user: user,
    username: user ? user.username : 'quanmi112',
    balance: user ? user.balance : 0,
    isAdmin: user && user.role === 'admin'
  });
});

// Chơi Game Độc Lập
app.get('/game/:gameCode', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
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

// ==========================================
// 2. API TÀI KHOẢN & VÍ
// ==========================================

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
  const { username, password } = req.body;
  const u = (username || '').trim();
  const p = (password || '').trim();

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
    role: "user",
    balance: 0,
    custom_win_rate: null, // Mặc định theo sảnh
    vip: 0,
    created_at: new Date().toISOString()
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

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng nhập thành công!', user: users[u] });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Nạp tiền
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

// ==========================================
// 3. API ĐẶT CƯỢC & THUẬT TOÁN KẾT QUẢ GAME
// ==========================================
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

  // CHẶN NẾU HẾT TIỀN
  if (user.balance < betAmount) {
    return res.status(400).json({ 
      error: "Số dư không đủ! Vui lòng quay ra sảnh nạp thêm tiền để tiếp tục.",
      current_balance: user.balance 
    });
  }

  // 1. Trừ tiền cược
  user.balance -= betAmount;

  // 2. Thuật toán xác định tỷ lệ thắng theo phân cấp ưu tiên:
  // Nếu có custom_win_rate của Admin ép riêng -> dùng nó. Không thì lấy win_rate chung của game.
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

// ==========================================
// 4. BỘ API ĐẶC QUYỀN DÀNH CHO ADMIN
// ==========================================

// Lấy danh sách thành viên và các game
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const users = readData(DB_FILE);
  const games = readData(GAME_CONFIG_FILE, DEFAULT_GAMES);
  res.json({ success: true, users, games });
});

// Admin can thiệp số dư ví (Cộng / Trừ / Đặt số cụ thể)
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

// Admin can thiệp Tỉ Lệ Thắng riêng từng người (User RTP: 0.0 -> 1.0 hoặc null)
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

// Admin can thiệp Tỉ Lệ Game toàn sảnh (Game RTP: 0.0 -> 1.0)
app.post('/api/admin/set-game-rtp', requireAdmin, (req, res) => {
  const { gameCode, win_rate } = req.body;
  const games = readData(GAME_CONFIG_FILE, DEFAULT_GAMES);

  if (!games[gameCode]) {
    games[gameCode] = { name: gameCode, win_rate: 0.35, min_bet: 5000 };
  }

  games[gameCode].win_rate = Number(win_rate);
  saveData(GAME_CONFIG_FILE, games);
  res.json({ success: true, message: `Đã cập nhật tỉ lệ nổ của game ${gameCode} thành ${Number(win_rate) * 100}%` });
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server Engine] Khởi động thành công trên cổng ${PORT}`);
});
