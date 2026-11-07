const express = require('express');
const session = require('express-session');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'qq88-secret-session-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// LƯU TRỮ KÉP (DATA.JSON + MONGODB)
// ==========================================
const MONGO_URI = process.env.MONGO_URI || '';
let isMongoConnected = false;

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, default: '' },
  phone: { type: String, default: '' },
  balance: { type: Number, default: 1430 },
  role: { type: String, default: 'user' },
  joinDate: { type: String, default: '2026-09-30' },
  bank_name: { type: String, default: '' },
  bank_account: { type: String, default: '' },
  bank_owner: { type: String, default: '' },
  withdraw_password: { type: String, default: '' },
  isBankLocked: { type: Boolean, default: false }
}, { minimize: false });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      isMongoConnected = true;
      console.log('✅ Connected to MongoDB Atlas');
      await syncMongoToLocal();
    })
    .catch(err => console.error('⚠️ MongoDB fallback to data.json:', err.message));
}

function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const init = { users: {} };
      fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2), 'utf8');
      return init;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed.users) parsed.users = {};
    return parsed;
  } catch (e) {
    return { users: {} };
  }
}

function writeLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing data.json:', e.message);
  }
}

async function syncMongoToLocal() {
  if (!isMongoConnected) return;
  try {
    const users = await UserModel.find({}).lean();
    const localData = readLocalData();
    users.forEach(u => {
      localData.users[u.username] = u;
    });
    writeLocalData(localData);
  } catch (e) {}
}

async function saveUserDual(userObj) {
  const localData = readLocalData();
  localData.users[userObj.username] = userObj;
  writeLocalData(localData);

  if (isMongoConnected) {
    try {
      await UserModel.findOneAndUpdate(
        { username: userObj.username },
        { $set: userObj },
        { upsert: true, new: true }
      );
    } catch (e) {}
  }
}

async function getUserDual(username) {
  if (!username) return null;
  const key = String(username).trim();
  const localData = readLocalData();
  if (localData.users[key]) return localData.users[key];

  const lowerKey = key.toLowerCase();
  const found = Object.keys(localData.users).find(k => k.toLowerCase() === lowerKey);
  if (found) return localData.users[found];

  if (isMongoConnected) {
    const u = await UserModel.findOne({ username: key }).lean();
    if (u) {
      localData.users[u.username] = u;
      writeLocalData(localData);
      return u;
    }
  }
  return null;
}

// ==========================================
// ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/me', async (req, res) => {
  if (req.session && req.session.username) {
    const user = await getUserDual(req.session.username);
    if (user) return res.json({ loggedIn: true, user });
  }
  return res.json({ loggedIn: false });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, fullName, phone } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' });
    }
    const cleanUser = username.trim();
    const existing = await getUserDual(cleanUser);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });
    }

    const newUser = {
      username: cleanUser,
      password: password.trim(),
      fullName: (fullName || 'HỘI VIÊN').trim().toUpperCase(),
      phone: (phone || '').trim(),
      balance: 1430,
      role: 'user',
      joinDate: '2026-09-30',
      bank_name: '',
      bank_account: '',
      bank_owner: (fullName || '').trim().toUpperCase(),
      withdraw_password: '',
      isBankLocked: false
    };

    await saveUserDual(newUser);
    req.session.username = newUser.username;
    return res.json({ success: true, message: 'Đăng ký tài khoản thành công!', user: newUser });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin!' });
    }
    const user = await getUserDual(username.trim());
    if (!user || user.password !== password.trim()) {
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác!' });
    }
    req.session.username = user.username;
    return res.json({ success: true, message: 'Đăng nhập thành công!', user });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/deposit', async (req, res) => {
  try {
    if (!req.session || !req.session.username) return res.status(401).json({ success: false });
    const user = await getUserDual(req.session.username);
    if (!user) return res.status(404).json({ success: false });

    const addAmount = Number(req.body.amount || 0);
    if (addAmount > 0) {
      user.balance = Number(user.balance || 0) + addAmount;
      await saveUserDual(user);
    }
    return res.json({ success: true, new_balance: user.balance, user });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
});

app.post('/api/user/bind-bank', async (req, res) => {
  try {
    if (!req.session || !req.session.username) return res.json({ success: false, message: 'Vui lòng đăng nhập lại!' });
    const user = await getUserDual(req.session.username);
    if (!user) return res.json({ success: false, message: 'Không tìm thấy tài khoản!' });

    if (user.isBankLocked || (user.bank_account && user.bank_name)) {
      return res.json({ success: false, message: 'Tài khoản ngân hàng đã được khóa bảo mật vĩnh viễn!' });
    }

    const { bank_name, bank_owner, bank_account, withdraw_password } = req.body;
    user.bank_name = bank_name.trim().toUpperCase();
    user.bank_owner = (bank_owner || user.bank_owner || 'NGUYEN VAN A').trim().toUpperCase();
    user.bank_account = bank_account.trim();
    user.withdraw_password = withdraw_password.trim();
    user.isBankLocked = true;

    await saveUserDual(user);
    return res.json({ success: true, message: 'Liên kết thẻ ngân hàng và khóa bảo mật thành công!', user });
  } catch (e) {
    return res.json({ success: false, message: 'Lỗi máy chủ!' });
  }
});

app.post('/api/user/withdraw', async (req, res) => {
  try {
    if (!req.session || !req.session.username) return res.json({ success: false, message: 'Vui lòng đăng nhập!' });
    const user = await getUserDual(req.session.username);
    if (!user) return res.json({ success: false, message: 'Không tìm thấy tài khoản!' });

    const { amountPoints, withdraw_password } = req.body;
    if (user.withdraw_password && user.withdraw_password !== String(withdraw_password || '').trim()) {
      return res.json({ success: false, message: 'Mật khẩu rút tiền không chính xác!' });
    }

    const points = Number(amountPoints || 0);
    const amountVND = points * 1000;
    if (amountVND > Number(user.balance || 0)) {
      return res.json({ success: false, message: 'Số dư khả dụng không đủ!' });
    }

    user.balance = Number(user.balance) - amountVND;
    await saveUserDual(user);
    return res.json({ success: true, message: `Gửi lệnh rút ${points}K thành công!`, user });
  } catch (e) {
    return res.json({ success: false, message: 'Lỗi rút tiền!' });
  }
});

app.get('/loading-gateway', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Đang kết nối máy chủ QQ88...</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f4f6f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: #333;
    }
    .spinner {
      width: 54px;
      height: 54px;
      border: 4px solid rgba(0, 122, 51, 0.18);
      border-top-color: #007a33;
      border-radius: 50%;
      animation: spin 0.85s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status-text { font-size: 15px; font-weight: 600; color: #006837; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <div class="status-text">Đang đồng bộ đường truyền máy chủ...</div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`🚀 Server QQ88 running at port ${PORT}`);
});
