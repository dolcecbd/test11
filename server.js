const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cài đặt EJS làm view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cấp quyền truy cập thư mục public (để lấy ảnh từ public/images)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Cấu hình Session (Giữ trạng thái đăng nhập và số dư không bị mất khi F5)
app.use(session({
    secret: 'mat-khau-bi-mat-cua-quan-qq88',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// 1. DATABASE TÀI KHOẢN & TỪ ĐIỂN CƠ CHẾ GAME
// ==========================================
const users_db = {};      // Lưu theo userId: { username, password, balance, vip }
const username_map = {};  // Map tên đăng nhập -> userId

// Mỗi game có cơ chế (winRate: tỷ lệ thắng, multipliers: các mức nhân, symbols: biểu tượng riêng)
const GAMES_CONFIG = {
    "slot-caoboi": {
        name: "Quyết Chiến Tiền Thưởng",
        template: "game-slot",
        min_bet: 2000,
        win_rate: 0.35, // 35% tỷ lệ ăn
        multipliers: [2, 3, 5, 10, 25],
        symbols: ["🤠", "🔫", "🥃", "💰", "🎩", "⭐", "💎", "🃏"]
    },
    "banca-jackpot": {
        name: "Jackpot Đánh Cá",
        template: "game-slot",
        min_bet: 5000,
        win_rate: 0.40,
        multipliers: [2, 4, 8, 20],
        symbols: ["🦈", "🐠", "🐙", "🦀", "🐳", "🔱", "💣", "👑"]
    },
    "gamebai-taixiu": {
        name: "Tài Xỉu V8",
        template: "game-slot",
        min_bet: 10000,
        win_rate: 0.48,
        multipliers: [2],
        symbols: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
    }
};

// Hàm lấy cấu hình game (Nếu bấm vào bất kỳ game nào trong 50 game chưa khai báo, tự động tạo cơ chế riêng cho mã game đó)
function getGameConfig(gameCode) {
    if (GAMES_CONFIG[gameCode]) return GAMES_CONFIG[gameCode];
    return {
        name: gameCode.toUpperCase().replace(/-/g, ' '),
        template: "game-slot",
        min_bet: 2000,
        win_rate: 0.30,
        multipliers: [2, 3, 5, 15],
        symbols: ["🎰", "💎", "7️⃣", "🍒", "🔔", "⭐", "🍀", "👑"]
    };
}

// Đảm bảo luôn có tài khoản trong session
function getOrCreateUser(req) {
    if (!req.session.userId || !users_db[req.session.userId]) {
        const newId = uuidv4();
        const defaultUsername = 'quanmi112';
        req.session.userId = newId;
        users_db[newId] = {
            id: newId,
            username: defaultUsername,
            password: '123',
            balance: 0, // Mặc định 0đ, phải nạp tiền mới chơi được
            vip: 0
        };
        username_map[defaultUsername] = newId;
    }
    return users_db[req.session.userId];
}

// ==========================================
// 2. SẢNH CHÍNH & API TÀI KHOẢN
// ==========================================
app.get('/', (req, res) => {
    const user = getOrCreateUser(req);
    res.render('index', {
        username: user.username,
        balance: user.balance
    });
});

// Lấy thông tin tài khoản & số dư hiện tại
app.get('/api/me', (req, res) => {
    const user = getOrCreateUser(req);
    res.json({
        loggedIn: true,
        user: {
            username: user.username,
            balance: user.balance,
            vip: user.vip
        }
    });
});

// Đăng ký
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || username.length < 4) {
        return res.json({ success: false, message: 'Tên tài khoản phải từ 4 ký tự!' });
    }
    if (username_map[username]) {
        return res.json({ success: false, message: 'Tên tài khoản đã tồn tại!' });
    }
    const newId = uuidv4();
    users_db[newId] = { id: newId, username, password, balance: 0, vip: 0 };
    username_map[username] = newId;
    req.session.userId = newId;

    res.json({
        success: true,
        message: 'Đăng ký thành công! Vui lòng nạp tiền để chơi.',
        user: users_db[newId]
    });
});

// Đăng nhập
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const uid = username_map[username];
    if (!uid || users_db[uid].password !== password) {
        return res.json({ success: false, message: 'Sai tài khoản hoặc mật khẩu!' });
    }
    req.session.userId = uid;
    res.json({
        success: true,
        message: 'Đăng nhập thành công!',
        user: users_db[uid]
    });
});

// Đăng xuất
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Nạp tiền vào tài khoản
app.post('/api/deposit', (req, res) => {
    const user = getOrCreateUser(req);
    const amount = parseInt(req.body.amount) || 0;
    if (amount <= 0) {
        return res.status(400).json({ error: 'Số tiền nạp không hợp lệ!' });
    }
    user.balance += amount;
    res.json({
        status: 'success',
        new_balance: user.balance
    });
});

// ==========================================
// 3. ROUTE ĐỘNG MỞ TỪNG GAME RIÊNG BIỆT
// ==========================================
app.get('/game/:gameCode', (req, res) => {
    const user = getOrCreateUser(req);
    const gameCode = req.params.gameCode;
    const gameInfo = getGameConfig(gameCode);

    res.render(gameInfo.template, {
        game_code: gameCode,
        game_name: gameInfo.name,
        balance: user.balance,
        min_bet: gameInfo.min_bet,
        symbols: JSON.stringify(gameInfo.symbols)
    });
});

// ==========================================
// 4. API QUAY THƯỞNG / TRỪ TIỀN THẬT TRÊN SERVER
// ==========================================
app.post('/api/play/:gameCode', (req, res) => {
    const user = getOrCreateUser(req);
    const gameCode = req.params.gameCode;
    const gameInfo = getGameConfig(gameCode);

    const betAmount = parseInt(req.body.bet_amount) || gameInfo.min_bet;

    // KIỂM TRA SỐ DƯ: Nếu hết tiền hoặc không đủ cược -> Chặn ngay lập tức!
    if (user.balance < betAmount) {
        return res.status(400).json({
            error: "Số dư không đủ! Vui lòng thoát ra sảnh nạp thêm tiền để tiếp tục chơi.",
            current_balance: user.balance
        });
    }

    // 1. Trừ tiền cược ngay trên Server
    user.balance -= betAmount;

    // 2. Xử lý cơ chế thắng/thua độc lập của từng game
    let winAmount = 0;
    let multiplier = 1;
    const isWin = Math.random() < gameInfo.win_rate;

    // Tạo lưới kết quả 6x4 (24 ô)
    const grid = [];
    const syms = gameInfo.symbols;
    const winningSym = syms[Math.floor(Math.random() * syms.length)];

    for (let i = 0; i < 24; i++) {
        if (isWin && i < 12 && Math.random() < 0.65) {
            grid.push(winningSym);
        } else {
            grid.push(syms[Math.floor(Math.random() * syms.length)]);
        }
    }

    if (isWin) {
        const multis = gameInfo.multipliers;
        multiplier = multis[Math.floor(Math.random() * multis.length)];
        winAmount = betAmount * multiplier;
        user.balance += winAmount;
    }

    // 3. Trả về số dư thực tế sau khi đã trừ/cộng
    res.json({
        status: "success",
        is_win: isWin,
        multiplier: multiplier,
        win_amount: winAmount,
        new_balance: user.balance,
        grid: grid,
        msg: isWin ? `NỔ HŨ X${multiplier}! Thắng +${winAmount.toLocaleString('vi-VN')} đ` : "Chúc bạn may mắn lần sau!"
    });
});

app.listen(PORT, () => {
    console.log(`Server chạy tại: http://localhost:${PORT}`);
});
