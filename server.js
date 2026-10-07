const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Nén dữ liệu truyền tải để tối ưu tốc độ mạng
app.use(compression());

// Phục vụ thư mục tĩnh public với cấu hình cache ảnh mượt mà
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d'
}));

// Route phục vụ trang chủ
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[QQ88 Server] Server is running on port ${PORT}`);
});