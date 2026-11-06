const express = require('express');
const compression = require('compression');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

let mongoose = null;
try {
  mongoose = require('mongoose');
} catch (err) {
  console.log('[QQ88 System] Chạy chế độ Local JSON (chưa cài hoặc không dùng mongoose).');
}

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
app.use('/images', express.static(path.join(__dirname, 'public', 'images'), { maxAge: '1d' }));

// FILE LƯU TRỮ CỤC BỘ (HỖ TRỢ ĐỒNG BỘ CẢ data.json VÀ users_data.json)
const DB_FILE = path.join(__dirname, 'users_data.json');
const DATA_JSON_FILE = path.join(__dirname, 'data.json');
const GAME_CONFIG_FILE = path.join(__dirname, 'games_config.json');

const DEFAULT_GAMES = {
  "slot-caoboi": { name: "Quyết Chiến Tiền Thưởng", win_rate: 0.35, min_bet: 10000, symbols: ["🤠", "🔫", "🥃", "💰", "🎩", "⭐"] },
  "banca-jackpot": { name: "Jackpot Đánh Cá", win_rate: 0.40, min_bet: 5000, symbols: ["🦈", "🐠", "🐙", "🦀", "🐳", "🔱"] },
  "gamebai-taixiu": { name: "Tài Xỉu V8", win_rate: 0.48, min_bet: 10000, symbols: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] }
};

// KẾT NỐI MONGODB ATLAS TÙY CHỌN (CƠ CHẾ LƯU TRỮ KÉP)
let CloudStore = null;
const MONGO_URI = process.env.MONGO_URI || '';

if (mongoose && MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('[QQ88 MongoDB] Đã kết nối MongoDB Atlas thành công!');
      const storeSchema = new mongoose.Schema({
        key: { type: String, unique: true },
        payload: mongoose.Schema.Types.Mixed,
        updatedAt: { type: Date, default: Date.now }
      });
      CloudStore = mongoose.models.CloudStore || mongoose.model('CloudStore', storeSchema);

      // Đồng bộ dữ liệu từ Cloud về file JSON khi khởi động trên Render
      const cloudUsers = await CloudStore.findOne({ key: 'users_data' });
      if (cloudUsers && cloudUsers.payload) {
        fs.writeFileSync(DB_FILE, JSON.stringify(cloudUsers.payload, null, 2));
        fs.writeFileSync(DATA_JSON_FILE, JSON.stringify(cloudUsers.payload, null, 2));
        console.log('[QQ88 MongoDB] Đã khôi phục dữ liệu người chơi từ MongoDB Atlas!');
      }
    })
    .catch((err) => {
      console.log('[QQ88 MongoDB] Không thể kết nối Atlas, hệ thống tự động chạy bằng file JSON cục bộ:', err.message);
    });
}

function readData(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      if (file === DB_FILE && fs.existsSync(DATA_JSON_FILE)) {
        const backupData = fs.readFileSync(DATA_JSON_FILE, 'utf8') || '{}';
        fs.writeFileSync(DB_FILE, backupData);
        return JSON.parse(backupData);
      }
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    }
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (e) {
    return fallback;
  }
}

function saveData(file, data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(file, jsonStr);
    if (file === DB_FILE) {
      fs.writeFileSync(DATA_JSON_FILE, jsonStr);
      if (CloudStore) {
        CloudStore.findOneAndUpdate(
          { key: 'users_data' },
          { payload: data, updatedAt: new Date() },
          { upsert: true }
        ).catch(() => {});
      }
    }
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
      vip: 10,
      rebate_available: 150000,
      withdraw_history: [],
      rebate_history: [],
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

// 1. ROUTE ĐIỀU HƯỚNG (CHỐNG LỖI ĐƯỜNG DẪN VIEW TRÊN RENDER)
app.get('/', (req, res) => {
  const user = req.session.user || null;
  const viewData = {
    user: user,
    username: user ? user.username : 'quanmi112',
    balance: user ? user.balance : 0,
    isAdmin: user && user.role === 'admin'
  };

  const ejsViewPath = path.join(__dirname, 'views', 'index.ejs');
  const htmlViewPath = path.join(__dirname, 'views', 'index.html');
  const rootHtmlPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(ejsViewPath)) {
    return res.render('index', viewData);
  } else if (fs.existsSync(htmlViewPath)) {
    return res.sendFile(htmlViewPath);
  } else if (fs.existsSync(rootHtmlPath)) {
    return res.sendFile(rootHtmlPath);
  } else {
    return res.status(500).send('Không tìm thấy file giao diện (views/index.ejs hoặc index.html)');
  }
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

  const slotViewPath = path.join(__dirname, 'views', 'game-slot.ejs');
  if (fs.existsSync(slotViewPath)) {
    return res.render('game-slot', {
      game_code: gameCode,
      game_name: gameInfo.name,
      balance: currentUser.balance,
      min_bet: gameInfo.min_bet,
      symbols: JSON.stringify(gameInfo.symbols)
    });
  }

  // Giao diện quay slot dự phòng nếu chưa tạo file views/game-slot.ejs
  res.send(`<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${gameInfo.name}</title>
    <style>
      body{background:#0b1f13;color:#fff;font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:16px;text-align:center;}
      .box{background:#123520;border:2px solid #facc15;border-radius:16px;padding:20px;width:100%;max-width:350px;}
      .reels{display:flex;justify-content:center;gap:12px;margin:20px 0;font-size:42px;background:#07170d;padding:16px;border-radius:12px;}
      .btn{background:linear-gradient(180deg,#facc15,#ca8a04);color:#000;font-weight:900;border:none;padding:12px 24px;border-radius:30px;font-size:15px;cursor:pointer;width:100%;}
      .bal{color:#facc15;font-weight:bold;font-size:18px;margin-bottom:8px;}
    </style>
  </head>
  <body>
    <div class="box">
      <h3 style="margin:0 0 10px 0;color:#ffde00;">${gameInfo.name}</h3>
      <div class="bal">Số dư: <span id="b">${Number(currentUser.balance || 0).toLocaleString('vi-VN')}</span> đ</div>
      <div class="reels" id="r"><span>🎰</span><span>💎</span><span>7️⃣</span></div>
      <div id="m" style="min-height:22px;font-size:13px;color:#4ade80;margin-bottom:12px;">Cược mỗi lượt: ${gameInfo.min_bet.toLocaleString('vi-VN')} đ</div>
      <button class="btn" onclick="spin()">QUAY THƯỞNG NGAY</button>
    </div>
    <script>
      const syms = ${JSON.stringify(gameInfo.symbols)};
      async function spin(){
        const res = await fetch('/api/play/${gameCode}', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bet_amount:${gameInfo.min_bet}})});
        const d = await res.json();
        if(d.error){ document.getElementById('m').innerText = d.error; return; }
        const s = syms[Math.floor(Math.random()*syms.length)];
        document.getElementById('r').innerHTML = d.is_win ? \`<span>\${s}</span><span>\${s}</span><span>\${s}</span>\` : \`<span>\${syms[0]}</span><span>\${syms[1]}</span><span>\${syms[2]}</span>\`;
        document.getElementById('b').innerText = Number(d.new_balance).toLocaleString('vi-VN');
        document.getElementById('m').innerText = d.msg;
      }
    </script>
  </body>
  </html>`);
});

// 2. API TÀI KHOẢN & VÍ
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

  if (u.length < 4 || !p) {
    return res.status(400).json({ success: false, message: 'Tài khoản tối thiểu 4 ký tự và phải có mật khẩu!' });
  }

  const users = readData(DB_FILE);
  if (users[u]) {
    return res.status(400).json({ success: false, message: 'Tài khoản đã tồn tại!' });
  }

  users[u] = {
    username: u,
    password: p,
    fullname: (fullname || '').trim(),
    phone: (phone || '').trim(),
    role: "user",
    balance: 0,
    custom_win_rate: null,
    bank_name: "",
    bank_account: "",
    bank_owner: "",
    bank_locked: false,
    vip: 0,
    rebate_available: 0,
    withdraw_history: [],
    rebate_history: [],
    last_checkin: null,
    created_at: new Date().toISOString()
  };
  saveData(DB_FILE, users);

  req.session.user = users[u];
  res.json({ success: true, message: 'Đăng ký tài khoản thành công!', user: users[u] });
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

app.post('/api/deposit', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập!' });
  const amount = Number(req.body.amount || 0);
  if (amount <= 0) return res.status(400).json({ success: false, message: 'Số tiền nạp không hợp lệ!' });

  const users = readData(DB_FILE);
  const u = req.session.user.username;

  if (users[u]) {
    users[u].balance = (users[u].balance || 0) + amount;
    // Cộng thêm 1.5% hoàn trả tích lũy khi nạp/cược
    users[u].rebate_available = (users[u].rebate_available || 0) + Math.floor(amount * 0.015);
    saveData(DB_FILE, users);
    req.session.user = users[u];
    return res.json({ status: 'success', new_balance: users[u].balance, user: users[u] });
  }
  res.status(404).json({ success: false });
});

// LIÊN KẾT NGÂN HÀNG (KHÓA CỨNG VĨNH VIỄN SAU KHI LƯU LẦN ĐẦU)
app.post('/api/bind-bank', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
  const { bank_name, bank_account, bank_owner } = req.body;

  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });

  // Kiểm tra nếu đã khóa hoặc đã có thông tin ngân hàng thì chặn tuyệt đối
  if (user.bank_locked || (user.bank_name && user.bank_account && user.bank_owner)) {
    return res.status(403).json({
      success: false,
      message: 'Thông tin ngân hàng đã được khóa bảo mật vĩnh viễn! Chỉ Admin mới có quyền thay đổi.'
    });
  }

  if (!bank_name || !bank_account || !bank_owner) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ Ngân hàng, Số tài khoản và Tên chủ thẻ!' });
  }

  user.bank_name = bank_name.trim().toUpperCase();
  user.bank_account = bank_account.trim();
  user.bank_owner = bank_owner.trim().toUpperCase();
  user.bank_locked = true;

  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({
    success: true,
    message: 'Liên kết ngân hàng thành công! Thông tin đã được khóa bảo mật.',
    user: user
  });
});

// YÊU CẦU RÚT TIỀN
app.post('/api/withdraw', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
  const amount = Number(req.body.amount || 0);

  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });

  if (!user.bank_name || !user.bank_account || !user.bank_owner) {
    return res.status(400).json({ success: false, message: 'Vui lòng liên kết ngân hàng trước khi rút tiền!' });
  }

  if (amount < 100000) {
    return res.status(400).json({ success: false, message: 'Số tiền rút tối thiểu là 100,000 VND (100K)!' });
  }

  if ((user.balance || 0) < amount) {
    return res.status(400).json({ success: false, message: 'Số dư ví không đủ để thực hiện lệnh rút!' });
  }

  user.balance -= amount;
  if (!Array.isArray(user.withdraw_history)) user.withdraw_history = [];
  user.withdraw_history.unshift({
    id: 'WD' + Date.now(),
    amount: amount,
    bank_name: user.bank_name,
    bank_account: user.bank_account,
    bank_owner: user.bank_owner,
    status: 'Đang xử lý',
    time: new Date().toLocaleString('vi-VN')
  });

  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({
    success: true,
    message: `Tạo lệnh rút ${amount.toLocaleString('vi-VN')} đ thành công!`,
    new_balance: user.balance,
    user: user
  });
});

// ĐIỂM DANH NHẬN THƯỞNG MỖI NGÀY
app.post('/api/checkin', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];
  if (!user) return res.status(404).json({ success: false });

  const today = new Date().toISOString().slice(0, 10);
  if (user.last_checkin === today) {
    return res.json({ success: false, message: 'Hôm nay bạn đã điểm danh rồi! Quay lại vào ngày mai nhé.' });
  }

  const reward = 18000; // Thưởng điểm danh 18K
  user.last_checkin = today;
  user.balance = (user.balance || 0) + reward;
  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({
    success: true,
    message: `Điểm danh thành công! Nhận +${reward.toLocaleString('vi-VN')} đ vào ví!`,
    new_balance: user.balance,
    user: user
  });
});

// NHẬN HOÀN TRẢ TỨC THỜI
app.post('/api/rebate/claim', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập!' });
  const users = readData(DB_FILE);
  const u = req.session.user.username;
  const user = users[u];
  if (!user) return res.status(404).json({ success: false });

  const rebate = Number(user.rebate_available || 0);
  if (rebate <= 0) {
    return res.json({ success: false, message: 'Hiện chưa có tiền hoàn trả khả dụng để nhận!' });
  }

  user.balance = (user.balance || 0) + rebate;
  user.rebate_available = 0;
  if (!Array.isArray(user.rebate_history)) user.rebate_history = [];
  user.rebate_history.unshift({
    id: 'RB' + Date.now(),
    amount: rebate,
    time: new Date().toLocaleString('vi-VN')
  });

  saveData(DB_FILE, users);
  req.session.user = user;

  res.json({
    success: true,
    message: `Đã nhận hoàn trả +${rebate.toLocaleString('vi-VN')} đ vào tài khoản chính!`,
    new_balance: user.balance,
    user: user
  });
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
      role: user.role || "user",
      balance: Number(user.balance || 0),
      custom_win_rate: user.custom_win_rate || null,
      bank_name: user.bank_name || "",
      bank_account: user.bank_account || "",
      bank_owner: user.bank_owner || "",
      bank_locked: Boolean(user.bank_locked || (user.bank_name && user.bank_account)),
      vip: user.vip || 0,
      rebate_available: Number(user.rebate_available || 0),
      withdraw_history: user.withdraw_history || [],
      rebate_history: user.rebate_history || [],
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
  user.rebate_available = (user.rebate_available || 0) + Math.floor(betAmount * 0.02);

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

// 4. BỘ API ADMIN (QUYỀN TỐI CAO THAY ĐỔI NGÂN HÀNG ĐÃ KHÓA)
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

  if (bank_name !== undefined && bank_name !== '') users[targetUsername].bank_name = bank_name.trim().toUpperCase();
  if (bank_account !== undefined && bank_account !== '') users[targetUsername].bank_account = bank_account.trim();
  if (bank_owner !== undefined && bank_owner !== '') users[targetUsername].bank_owner = bank_owner.trim().toUpperCase();
  if (new_password !== undefined && new_password !== '') users[targetUsername].password = new_password.trim();

  if (users[targetUsername].bank_name && users[targetUsername].bank_account) {
    users[targetUsername].bank_locked = true;
  }

  saveData(DB_FILE, users);
  res.json({ success: true, message: `Admin đã cập nhật hồ sơ ngân hàng & mật khẩu cho ${targetUsername} thành công!` });
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
