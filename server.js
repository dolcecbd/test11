const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cài đặt EJS làm view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cấp quyền truy cập thư mục public (để lấy ảnh từ public/inmages)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Cấu hình Session (Lưu thông tin đăng nhập theo Cookie)
app.use(session({
    secret: 'mat-khau-bi-mat-cua-quan',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Nếu chạy HTTPS thì đổi thành true
}));

// ==========================================
// 1. DATABASE & TỪ ĐIỂN GAME (Tạm lưu trên RAM)
// ==========================================
const users_db = {};

const GAMES_CONFIG = {
    "slot-caoboi": {
        name: "Slot Cao Bồi",
        template: "game-slot", // Tên file EJS (không cần ghi .ejs)
        min_bet: 10000
    },
    // Sau này ông có game bắn cá thì thêm vào đây:
    // "banca": { name: "Bắn Cá JL", template: "banca", min_bet: 1000 }
};

// ==========================================
// 2. SẢNH CHÍNH (LOBBY)
// ==========================================
app.get('/', (req, res) => {
    // 1. Tạo tài khoản ảo nếu chưa có session
    if (!req.session.userId) {
        const newId = uuidv4();
        req.session.userId = newId;
        users_db[newId] = { balance: 50000 }; // Tặng 50k
    }

    const userId = req.session.userId;
    const currentBalance = users_db[userId].balance;

    // 2. Render file views/index.ejs và truyền dữ liệu số dư vào
    res.render('index', { balance: currentBalance });
});

// API nạp tiền (Dùng ở sảnh)
app.post('/api/deposit', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Chưa đăng nhập!" });
    
    const userId = req.session.userId;
    const amount = req.body.amount || 0;
    
    users_db[userId].balance += amount;
    res.json({ new_balance: users_db[userId].balance });
});

// ==========================================
// 3. ROUTE ĐỘNG ĐỂ MỞ GAME
// ==========================================
app.get('/game/:gameCode', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    
    const gameCode = req.params.gameCode;
    
    // Nếu mã game gõ bậy bạ trên URL thì báo lỗi
    if (!GAMES_CONFIG[gameCode]) {
        return res.status(404).send("Game không tồn tại!");
    }

    const userId = req.session.userId;
    const gameInfo = GAMES_CONFIG[gameCode];

    // Render đúng file ejs của game đó
    res.render(gameInfo.template, {
        game_code: gameCode,
        game_name: gameInfo.name,
        balance: users_db[userId].balance
    });
});

// ==========================================
// 4. API LOGIC XỬ LÝ KHI CHƠI GAME
// ==========================================
app.post('/api/play/:gameCode', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Chưa đăng nhập!" });
    
    const gameCode = req.params.gameCode;
    if (!GAMES_CONFIG[gameCode]) return res.status(400).json({ error: "Game lỗi!" });

    const userId = req.session.userId;
    const gameInfo = GAMES_CONFIG[gameCode];
    const betAmount = req.body.bet_amount || gameInfo.min_bet;

    // Check tiền
    if (users_db[userId].balance < betAmount) {
        return res.status(400).json({ error: "Số dư không đủ, vui lòng nạp thêm!" });
    }

    // Trừ tiền cược
    users_db[userId].balance -= betAmount;
    let winAmount = 0;
    let resultData = {};

    // Logic từng game
    if (gameCode === "slot-caoboi") {
        const isWin = Math.random() < 0.25; // 25% tỷ lệ thắng
        if (isWin) {
            winAmount = betAmount * 3;
            resultData.spin_result = ["WILD", "GUN", "HAT"];
            resultData.msg = "Trúng nổ hũ x3!";
        } else {
            resultData.spin_result = ["HAT", "COIN", "STAR"];
            resultData.msg = "Tạch!";
        }
    }

    // Cộng thưởng
    users_db[userId].balance += winAmount;

    res.json({
        status: "success",
        new_balance: users_db[userId].balance,
        win_amount: winAmount,
        game_data: resultData
    });
});

app.listen(PORT, () => {
    console.log(`Server chạy tại: http://localhost:${PORT}`);
});
