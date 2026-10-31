const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Cài đặt EJS làm view engine để render linh hoạt sảnh và các game
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// ==========================================
// TỪ ĐIỂN CẤU HÌNH 50+ GAME ĐỘC LẬP
// ==========================================
const GAMES_CONFIG = {
  "slot-caoboi": { name: "Quyết Chiến Tiền Thưởng", template: "game-slot", min_bet: 10000, win_rate: 0.35, symbols: ["🤠", "🔫", "🥃", "💰", "🎩", "⭐"] },
  "banca-jackpot": { name: "Jackpot Đánh Cá", template: "game-slot", min_bet: 5000, win_rate: 0.40, symbols: ["🦈", "🐠", "🐙", "🦀", "🐳", "🔱"] },
  "gamebai-taixiu": { name: "Tài Xỉu V8", template: "game-slot", min_bet: 10000, win_rate: 0.48, symbols: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] }
};

function getGameConfig(gameCode) {
  if (GAMES_CONFIG[gameCode]) return GAMES_CONFIG[gameCode];
  // Cơ chế dự phòng cho các game khác bấm vào tự sinh cấu hình
  return {
    name: gameCode.toUpperCase().replace(/-/g, ' '),
    template: "game-slot",
    min_bet: 5000,
    win_rate: 0.30,
    symbols: ["🎰", "💎", "7️⃣", "🍒", "🔔", "⭐"]
  };
}

// 1. API Đăng ký
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

// 3. API Cập nhật / Nạp rút số dư tài khoản
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

// Hỗ trợ alias /api/deposit cho tương thích với sảnh nạp tiền
app.post('/api/deposit', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  }
  const amount = Number(req.body.amount || 0);
  const users = readUsers();
  const u = req.session.user.username;

  if (users[u]) {
    users[u].balance = Math.max(0, (users[u].balance || 0) + amount);
    saveUsers(users);
    req.session.user = users[u];
    return res.json({ status: 'success', new_balance: users[u].balance });
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

// ==========================================
// 7. ROUTE ĐỘNG MỞ TỪNG GAME RIÊNG BIỆT (/game/:gameCode)
// ==========================================
app.get('/game/:gameCode', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  const gameCode = req.params.gameCode;
  const gameInfo = getGameConfig(gameCode);
  const users = readUsers();
  const u = req.session.user.username;
  const currentBalance = users[u] ? users[u].balance : 0;

  // Render file EJS tương ứng (ví dụ: views/game-slot.ejs)
  res.render(gameInfo.template, {
    game_code: gameCode,
    game_name: gameInfo.name,
    balance: currentBalance,
    min_bet: gameInfo.min_bet,
    symbols: JSON.stringify(gameInfo.symbols)
  });
});

// ==========================================
// 8. API XỬ LÝ QUAY/CHƠI GAME & TRỪ TIỀN THẬT TRÊN SERVER
// ==========================================
app.post('/api/play/:gameCode', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: 'Chưa đăng nhập!' });
  }
  
  const gameCode = req.params.gameCode;
  const gameInfo = getGameConfig(gameCode);
  const betAmount = parseInt(req.body.bet_amount) || gameInfo.min_bet;

  const users = readUsers();
  const u = req.session.user.username;

  if (!users[u]) {
    return res.status(404).json({ success: false, error: 'Tài khoản không tồn tại!' });
  }

  // CHẶN NGAY LẬP TỨC NẾU KHÔNG ĐỦ TIỀN TRONG VÍ
  if (users[u].balance < betAmount) {
    return res.status(400).json({ 
      success: false, 
      error: "Số dư không đủ! Vui lòng quay lại sảnh chính nạp thêm tiền để tiếp tục chơi." 
    });
  }

  // Trừ tiền cược
  users[u].balance -= betAmount;
  
  let winAmount = 0;
  const isWin = Math.random() < gameInfo.win_rate;

  if (isWin) {
    winAmount = betAmount * 2; // Tỷ lệ nhân thưởng cơ bản
    users[u].balance += winAmount;
  }

  // Lưu lại vào file JSON ngay lập tức
  saveUsers(users);
  req.session.user = users[u];

  res.json({
    success: true,
    status: "success",
    is_win: isWin,
    win_amount: winAmount,
    new_balance: users[u].balance,
    msg: isWin ? `Thắng lớn +${winAmount.toLocaleString('vi-VN')} đ!` : "Chúc bạn may mắn lần sau!"
  });
});

// Render trang chủ bằng EJS để nhận dữ liệu ban đầu
app.get('/', (req, res) => {
  const user = req.session.user || null;
  const balance = user ? user.balance : 0;
  const username = user ? user.username : '';
  res.render('index', { username, balance });
});

// Fallback trả về index.html cho các route tĩnh khác nếu cần
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Server dang chay tren cong ${PORT}`);
});
