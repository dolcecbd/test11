const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use(session({
    secret: 'mat-khau-bi-mat-cua-quan-qq88',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const users_db = {};
const username_map = {};

const GAMES_CONFIG = {
    "slot-caoboi": { name: "Quyết Chiến Tiền Thưởng", template: "game-slot", min_bet: 10000, win_rate: 0.35, symbols: ["🤠", "🔫", "🥃", "💰", "🎩", "⭐"] },
    "banca-jackpot": { name: "Jackpot Đánh Cá", template: "game-slot", min_bet: 5000, win_rate: 0.40, symbols: ["🦈", "🐠", "🐙", "🦀", "🐳", "🔱"] },
    "gamebai-taixiu": { name: "Tài Xỉu V8", template: "game-slot", min_bet: 10000, win_rate: 0.48, symbols: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] }
};

function getGameConfig(gameCode) {
    if (GAMES_CONFIG[gameCode]) return GAMES_CONFIG[gameCode];
    return {
        name: gameCode.toUpperCase().replace(/-/g, ' '),
        template: "game-slot",
        min_bet: 5000,
        win_rate: 0.30,
        symbols: ["🎰", "💎", "7️⃣", "🍒", "🔔", "⭐"]
    };
}

function getOrCreateUser(req) {
    if (!req.session.userId || !users_db[req.session.userId]) {
        const newId = uuidv4();
        const defaultUsername = 'quanmi112';
        req.session.userId = newId;
        users_db[newId] = { id: newId, username: defaultUsername, password: '123', balance: 0, vip: 0 };
        username_map[defaultUsername] = newId;
    }
    return users_db[req.session.userId];
}

app.get('/', (req, res) => {
    const user = getOrCreateUser(req);
    res.render('index', { username: user.username, balance: user.balance });
});

app.get('/api/me', (req, res) => {
    const user = getOrCreateUser(req);
    res.json({ loggedIn: true, user: { username: user.username, balance: user.balance, vip: user.vip } });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let uid = username_map[username];
    if (!uid) {
        uid = uuidv4();
        users_db[uid] = { id: uid, username, password, balance: 0, vip: 0 };
        username_map[username] = uid;
    }
    req.session.userId = uid;
    res.json({ success: true, message: 'Đăng nhập thành công!', user: users_db[uid] });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (username_map[username]) return res.json({ success: false, message: 'Tài khoản đã tồn tại!' });
    const newId = uuidv4();
    users_db[newId] = { id: newId, username, password, balance: 0, vip: 0 };
    username_map[username] = newId;
    req.session.userId = newId;
    res.json({ success: true, message: 'Đăng ký thành công!', user: users_db[newId] });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/deposit', (req, res) => {
    const user = getOrCreateUser(req);
    const amount = parseInt(req.body.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ!' });
    user.balance += amount;
    res.json({ status: 'success', new_balance: user.balance });
});

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

app.post('/api/play/:gameCode', (req, res) => {
    const user = getOrCreateUser(req);
    const gameCode = req.params.gameCode;
    const gameInfo = getGameConfig(gameCode);
    const betAmount = parseInt(req.body.bet_amount) || gameInfo.min_bet;

    if (user.balance < betAmount) {
        return res.status(400).json({ error: "Số dư không đủ! Vui lòng quay lại sảnh chính nạp thêm tiền." });
    }

    user.balance -= betAmount;
    let winAmount = 0;
    const isWin = Math.random() < gameInfo.win_rate;

    if (isWin) {
        winAmount = betAmount * 2;
        user.balance += winAmount;
    }

    res.json({
        status: "success",
        is_win: isWin,
        win_amount: winAmount,
        new_balance: user.balance,
        msg: isWin ? `Thắng lớn +${winAmount.toLocaleString('vi-VN')} đ!` : "Chúc bạn may mắn lần sau!"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
