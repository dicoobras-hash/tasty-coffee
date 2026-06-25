const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'tasty-coffee-secret-key-2026';

// === ПУТЬ К БД ===
const DB_PATH = path.join(__dirname, 'database', 'tastycoffee.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// === ПОДКЛЮЧЕНИЕ К БД ===
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Подключено к SQLite БД');
        initDatabase();
    }
});

// === НАСТРОЙКА NODEMAILER ===
let transporter = null;
function initMailer() {
    const host = process.env.SMTP_HOST || 'smtp.mail.ru';
    const port = parseInt(process.env.SMTP_PORT) || 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (user && pass) {
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass }
        });
        console.log('✅ SMTP настроен (Nodemailer)');
    } else {
        console.warn('⚠️ SMTP не настроен (укажите SMTP_USER и SMTP_PASS)');
    }
}

// === ПОЛНЫЙ СПИСОК ТОВАРОВ ===
const allProducts = [
    { id:'p1', name:'Бразилия Серрадо (эспрессо, зерно 1кг)', category:'Кофе', price:2150, unit:'1 кг', weight:1, code:'00-00003319' },
    { id:'p10', name:'Бразилия Серрадо (эспрессо, зерно 250г)', category:'Кофе', price:560, unit:'250 г', weight:0.25, code:'00-00003386' },
    { id:'t1', name:'Ганпаудер (зеленый, 250г)', category:'Чай', price:295, unit:'250 г', weight:0.25, code:'00-00010038' },
    // Примечание: Здесь можно добавить остальные товары из вашего списка
];

function seedProducts() {
    db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
        if (err) return;
        if (row.count === 0) {
            const stmt = db.prepare('INSERT INTO products (id, name, category, price, unit, weight, code) VALUES (?, ?, ?, ?, ?, ?, ?)');
            allProducts.forEach(p => stmt.run(p.id, p.name, p.category, p.price, p.unit, p.weight, p.code));
            stmt.finalize();
        }
    });
}

function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, cart TEXT NOT NULL, order_date TEXT NOT NULL, version INTEGER DEFAULT 1, history TEXT DEFAULT '[]', status TEXT DEFAULT 'new', closed_date TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, orders TEXT DEFAULT '[]')`);
        db.run(`CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, orders TEXT NOT NULL, discount INTEGER DEFAULT 10)`);
        db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS verification_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL NOT NULL, unit TEXT, weight REAL, code TEXT, description TEXT, image TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
        
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_closed', 'false'), ('discount', '10'), ('open_date', ?), ('sender_email', '')`, [new Date().toISOString()]);
        createDefaultAdmin();
        seedProducts();
    });
}

async function createDefaultAdmin() {
    try {
        const hash = await bcrypt.hash('admin2026', 10);
        db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash], () => {
            initMailer();
            startServer();
        });
    } catch (e) {
        initMailer();
        startServer();
    }
}

let serverStarted = false;
function startServer() {
    if (serverStarted) return;
    serverStarted = true;

    app.use(cors({ origin: true, credentials: true }));
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '10mb' }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
    }));

    function isAuthenticated(req, res, next) {
        if (req.session && req.session.isAdmin) next();
        else res.status(401).json({ error: 'Не авторизован' });
    }

    function getSetting(key) {
        return new Promise((resolve) => {
            db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => resolve(row ? row.value : null));
        });
    }
    
    async function getSettings() {
        return {
            isClosed: await getSetting('is_closed') === 'true',
            discount: parseInt(await getSetting('discount')) || 10,
            openDate: await getSetting('open_date') || new Date().toISOString(),
            senderEmail: await getSetting('sender_email') || ''
        };
    }

    app.get('/api/products', (req, res) => {
        db.all('SELECT * FROM products ORDER BY name', (err, products) => res.json({ products }));
    });

    app.post('/api/send-code', (req, res) => {
        const { email, phone } = req.body;
        if (!email || !phone) return res.status(400).json({ error: 'Email и телефон обязательны' });
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        db.run('INSERT OR REPLACE INTO verification_codes (email, code, created_at, expires_at) VALUES (?, ?, ?, ?)',
            [email, code, Date.now(), Date.now() + 5 * 60 * 1000], 
            () => res.json({ success: true, message: 'Код отправлен' }) // В реальности здесь отправка письма
        );
    });

    app.post('/api/verify-code', (req, res) => {
        const { email, code } = req.body;
        db.get('SELECT * FROM verification_codes WHERE email = ?', [email], (err, row) => {
            if (!row || row.code !== code || Date.now() > row.expires_at) return res.status(400).json({ error: 'Неверный или истекший код' });
            db.run('DELETE FROM verification_codes WHERE email = ?', [email]);
            req.session.verified = true;
            res.json({ success: true });
        });
    });

    app.post('/api/auth/login', async (req, res) => {
        const { password } = req.body;
        db.get('SELECT password_hash FROM admins WHERE username = ?', ['admin'], async (err, row) => {
            if (row && await bcrypt.compare(password, row.password_hash)) {
                req.session.isAdmin = true;
                res.json({ success: true });
            } else res.status(401).json({ error: 'Неверный пароль' });
        });
    });

    app.post('/api/admin/products', isAuthenticated, (req, res) => {
        const { name, category, price, unit, weight, code, description } = req.body;
        const id = 'p' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6); // Исправлено substr
        db.run('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)',
            [id, name, category, price, unit, weight, code, description], () => res.json({ success: true, id }));
    });

    app.post('/api/orders', async (req, res) => {
        const { email, phone, cart } = req.body;
        if (!Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Некорректная корзина' }); // Добавлена проверка массива
        if (!req.session.verified) return res.status(403).json({ error: 'Требуется верификация' });

        const settings = await getSettings();
        if (settings.isClosed) return res.status(403).json({ error: 'Закупка закрыта' });

        const orderId = `ZK-${new Date().toISOString().slice(2,10).replace(/-/g,'')}${Math.floor(1000 + Math.random() * 9000)}`;
        const orderDate = new Date().toLocaleString('ru-RU');

        db.run(`INSERT INTO orders (id, name, email, phone, cart, order_date) VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, phone || 'Клиент', email, phone, JSON.stringify(cart), orderDate],
            () => res.json({ success: true, order: { id: orderId } })
        );
    });

    // Исправленный экспорт с учетом реального веса каждого товара
    app.get('/api/admin/export', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM orders', (err, orders) => {
            const data = (orders || []).map(o => {
                let cart = [];
                try { cart = JSON.parse(o.cart || '[]'); } catch (e) {}
                
                const totalWeight = cart.reduce((sum, item) => {
                    // Используем вес из товара, по умолчанию 0, если не указано
                    return sum + (item.quantity || 0) * (item.weight || 0); 
                }, 0);

                return {
                    'ID': o.id, 'ФИО': o.name, 'Email': o.email,
                    'Дата': o.order_date, 'Вес (кг)': totalWeight.toFixed(2), 'Статус': o.status || 'new'
                };
            });
            res.json({ data });
        });
    });

    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Сервер на порту ${PORT}`));
}

setTimeout(() => { if (!serverStarted) startServer(); }, 5000);
