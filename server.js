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

// ============================================================
// ПОЛНЫЙ СПИСОК ТОВАРОВ (все позиции из прайс-листа)
// ============================================================
const allProducts = [
    // === ЭСПРЕССО МОНОСОРТА (1кг) ===
    { id:'p1', name:'Бразилия Серрадо (эспрессо, зерно 1кг)', category:'Кофе', price:2150, unit:'1 кг', weight:1, code:'00-00003319' },
    { id:'p2', name:'Гватемала Фуэго (эспрессо, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'' },
    { id:'p3', name:'Кения Найроби (эспрессо, зерно 1кг)', category:'Кофе', price:2750, unit:'1 кг', weight:1, code:'' },
    { id:'p4', name:'Колумбия Богота (эспрессо, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'' },
    { id:'p5', name:'Коста-Рика Сан-Хосе (эспрессо, зерно 1кг)', category:'Кофе', price:2450, unit:'1 кг', weight:1, code:'00-00008552' },
    { id:'p6', name:'Руанда Кигали (эспрессо, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'' },
    { id:'p7', name:'Эфиопия Гуджи (эспрессо, зерно 1кг)', category:'Кофе', price:2600, unit:'1 кг', weight:1, code:'00-00008886' },
    { id:'p8', name:'Эфиопия Иргачефф (эспрессо, зерно 1кг)', category:'Кофе', price:2300, unit:'1 кг', weight:1, code:'00-00003323' },
    { id:'p9', name:'Эфиопия Оромия (эспрессо, зерно 1кг)', category:'Кофе', price:2600, unit:'1 кг', weight:1, code:'' },
    // === ЭСПРЕССО МОНОСОРТА (250г) ===
    { id:'p10', name:'Бразилия Серрадо (эспрессо, зерно 250г)', category:'Кофе', price:560, unit:'250 г', weight:0.25, code:'00-00003386' },
    { id:'p11', name:'Колумбия Богота (эспрессо, зерно 250г)', category:'Кофе', price:655, unit:'250 г', weight:0.25, code:'' },
    { id:'p12', name:'Коста-Рика Сан-Хосе (эспрессо, зерно 250г)', category:'Кофе', price:640, unit:'250 г', weight:0.25, code:'' },
    { id:'p13', name:'Эфиопия Гуджи (эспрессо, зерно 250г)', category:'Кофе', price:680, unit:'250 г', weight:0.25, code:'' },
    { id:'p14', name:'Эфиопия Иргачефф (эспрессо, зерно 250г)', category:'Кофе', price:600, unit:'250 г', weight:0.25, code:'00-00003390' },
    // === СМЕСИ ДЛЯ ЭСПРЕССО (1кг) ===
    { id:'p15', name:'Фанки (эспрессо-смесь, зерно 1кг)', category:'Кофе', price:2850, unit:'1 кг', weight:1, code:'' },
    { id:'p16', name:'Флорал (эспрессо-смесь, зерно 1кг)', category:'Кофе', price:2700, unit:'1 кг', weight:1, code:'' },
    { id:'p17', name:'Фрутти (эспрессо-смесь, зерно 1кг)', category:'Кофе', price:2600, unit:'1 кг', weight:1, code:'' },
    // === СМЕСИ ДЛЯ МОЛОЧНЫХ НАПИТКОВ (1кг) ===
    { id:'p18', name:'Брауни (молочная смесь, зерно 1кг)', category:'Кофе', price:2550, unit:'1 кг', weight:1, code:'00-00010018' },
    { id:'p19', name:'Бэрри (молочная смесь, зерно 1кг)', category:'Кофе', price:2400, unit:'1 кг', weight:1, code:'00-00006879' },
    { id:'p20', name:'Кэнди (молочная смесь, зерно 1кг)', category:'Кофе', price:2450, unit:'1 кг', weight:1, code:'00-00006773' },
    { id:'p21', name:'Натти (молочная смесь, зерно 1кг)', category:'Кофе', price:1430, unit:'1 кг', weight:1, code:'00-00006899' },
    { id:'p22', name:'Хани (молочная смесь, зерно 1кг)', category:'Кофе', price:2350, unit:'1 кг', weight:1, code:'00-00014516' },
    // === СМЕСИ ДЛЯ ФИЛЬТРА (1кг) ===
    { id:'p23', name:'Батч-Брю (фильтр, зерно 1кг)', category:'Кофе', price:2350, unit:'1 кг', weight:1, code:'' },
    { id:'p24', name:'Клин Скин (фильтр, зерно 1кг)', category:'Кофе', price:2150, unit:'1 кг', weight:1, code:'00-00007103' },
    // === МОНОСОРТА ДЛЯ ФИЛЬТРА (1кг) ===
    { id:'p25', name:'Бразилия Суль-де-Минас (фильтр, зерно 1кг)', category:'Кофе', price:2350, unit:'1 кг', weight:1, code:'' },
    { id:'p26', name:'Гватемала Сантьяго (фильтр, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'' },
    { id:'p27', name:'Индонезия Суматра Гайо (фильтр, зерно 1кг)', category:'Кофе', price:2800, unit:'1 кг', weight:1, code:'' },
    { id:'p28', name:'Кения Маунт (фильтр, зерно 1кг)', category:'Кофе', price:1755, unit:'1 кг', weight:1, code:'' },
    { id:'p29', name:'Колумбия Уила (фильтр, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'' },
    { id:'p30', name:'Руанда Киву (фильтр, зерно 1кг)', category:'Кофе', price:2500, unit:'1 кг', weight:1, code:'00-00004889' },
    { id:'p31', name:'Эфиопия Сидамо (фильтр, зерно 1кг)', category:'Кофе', price:2750, unit:'1 кг', weight:1, code:'' },
    // === МИКРОЛОТЫ ДЛЯ ФИЛЬТРА (1кг) ===
    { id:'p32', name:'Индонезия Ява Фринса Анаэробный (фильтр, 1кг)', category:'Кофе', price:3550, unit:'1 кг', weight:1, code:'' },
    { id:'p33', name:'Индонезия Ява Фринса Манис (фильтр, 1кг)', category:'Кофе', price:2275, unit:'1 кг', weight:1, code:'' },
    { id:'p34', name:'Кения Гитурара (фильтр, 1кг)', category:'Кофе', price:3000, unit:'1 кг', weight:1, code:'' },
    { id:'p35', name:'Кения Ндианин (фильтр, 1кг)', category:'Кофе', price:3200, unit:'1 кг', weight:1, code:'' },
    { id:'p36', name:'Кения Риакиберу (фильтр, 1кг)', category:'Кофе', price:2950, unit:'1 кг', weight:1, code:'' },
    { id:'p37', name:'Коста-Рика Дон Сабино Монтанья (фильтр, 1кг)', category:'Кофе', price:4050, unit:'1 кг', weight:1, code:'' },
    { id:'p38', name:'Коста-Рика Лас Маргаритас (фильтр, 1кг)', category:'Кофе', price:3850, unit:'1 кг', weight:1, code:'' },
    { id:'p39', name:'Перу Альто Пириас (фильтр, 1кг)', category:'Кофе', price:2950, unit:'1 кг', weight:1, code:'' },
    { id:'p40', name:'Руанда Гишеке (фильтр, 1кг)', category:'Кофе', price:2950, unit:'1 кг', weight:1, code:'' },
    { id:'p41', name:'Руанда Чеша (фильтр, 1кг)', category:'Кофе', price:2950, unit:'1 кг', weight:1, code:'' },
    { id:'p42', name:'Эфиопия Мукера 200 часов (фильтр, 1кг)', category:'Кофе', price:3350, unit:'1 кг', weight:1, code:'' },
    // === ЧАЙ ===
    { id:'t1', name:'Ганпаудер (зеленый, 250г)', category:'Чай', price:295, unit:'250 г', weight:0.25, code:'00-00010038' },
    { id:'t2', name:'Ганпаудер (зеленый, 100г)', category:'Чай', price:155, unit:'100 г', weight:0.1, code:'00-00010039' },
    { id:'t3', name:'Улун молочный (улун, 250г)', category:'Чай', price:400, unit:'250 г', weight:0.25, code:'00-00006093' },
    { id:'t4', name:'Улун молочный (улун, 100г)', category:'Чай', price:180, unit:'100 г', weight:0.1, code:'00-00007384' },
    { id:'t5', name:'Английский завтрак (черный, 100г)', category:'Чай', price:190, unit:'100 г', weight:0.1, code:'00-00007387' },
    { id:'t6', name:'Вишнёвый (черный аромат, 250г)', category:'Чай', price:560, unit:'250 г', weight:0.25, code:'00-00010451' },
    { id:'t7', name:'Вишнёвый (черный аромат, 100г)', category:'Чай', price:255, unit:'100 г', weight:0.1, code:'00-00010450' },
    { id:'t8', name:'Лесные Ягоды (черный аромат, 100г)', category:'Чай', price:220, unit:'100 г', weight:0.1, code:'00-00007398' },
    { id:'t9', name:'Масала (черный аромат, 100г)', category:'Чай', price:210, unit:'100 г', weight:0.1, code:'00-00007392' },
    { id:'t10', name:'Ананас-Кокос (зеленый аромат, 100г)', category:'Чай', price:185, unit:'100 г', weight:0.1, code:'00-00014619' },
    { id:'t11', name:'Тегуаньинь (улун, 100г)', category:'Чай', price:215, unit:'100 г', weight:0.1, code:'00-00010043' },
    { id:'t12', name:'Гречишный (травяной, 100г)', category:'Чай', price:170, unit:'100 г', weight:0.1, code:'00-00007376' },
    { id:'t13', name:'Масала (черный, 250г)', category:'Чай', price:465, unit:'250 г', weight:0.25, code:'' },
    { id:'t14', name:'Эрл Грей (черный, 100г)', category:'Чай', price:150, unit:'100 г', weight:0.1, code:'' },
    { id:'t15', name:'Сенча (зеленый, 100г)', category:'Чай', price:130, unit:'100 г', weight:0.1, code:'' },
    { id:'t16', name:'Матча (зеленый, 100г)', category:'Чай', price:765, unit:'100 г', weight:0.1, code:'' },
    { id:'t17', name:'Пуэр Дворцовый (пуэр, 250г)', category:'Чай', price:630, unit:'250 г', weight:0.25, code:'' },
    { id:'t18', name:'Пуэр Юннань 3 года (пуэр, 250г)', category:'Чай', price:515, unit:'250 г', weight:0.25, code:'' },
    // === КАПСУЛЫ ===
    { id:'c1', name:'Капсулы Брауни (10 шт)', category:'Капсулы', price:270, unit:'10 шт', weight:0.05, code:'' },
    { id:'c2', name:'Капсулы Бэрри (10 шт)', category:'Капсулы', price:260, unit:'10 шт', weight:0.05, code:'' },
    { id:'c3', name:'Капсулы Колумбия Богота (10 шт)', category:'Капсулы', price:280, unit:'10 шт', weight:0.05, code:'' },
    { id:'c4', name:'Капсулы Кэнди (10 шт)', category:'Капсулы', price:270, unit:'10 шт', weight:0.05, code:'00-00009996' },
    { id:'c5', name:'Капсулы Натти (10 шт)', category:'Капсулы', price:280, unit:'10 шт', weight:0.05, code:'' },
    { id:'c6', name:'Капсулы Руанда Кигали (10 шт)', category:'Капсулы', price:270, unit:'10 шт', weight:0.05, code:'' },
    { id:'c7', name:'Капсулы Фанки (10 шт)', category:'Капсулы', price:290, unit:'10 шт', weight:0.05, code:'00-00014881' },
    { id:'c8', name:'Капсулы Флорал (10 шт)', category:'Капсулы', price:270, unit:'10 шт', weight:0.05, code:'00-00012912' },
    { id:'c9', name:'Капсулы Фрутти (10 шт)', category:'Капсулы', price:280, unit:'10 шт', weight:0.05, code:'00-00012913' },
    { id:'c10', name:'Капсулы Эфиопия Гуджи (10 шт)', category:'Капсулы', price:280, unit:'10 шт', weight:0.05, code:'00-00009904' },
    { id:'c11', name:'Капсулы Эфиопия Гуджи (40 шт)', category:'Капсулы', price:1070, unit:'40 шт', weight:0.2, code:'00-00013233' },
    { id:'c12', name:'Капсулы Эфиопия Оромия (10 шт)', category:'Капсулы', price:280, unit:'10 шт', weight:0.05, code:'' },
    // === ДРИП-ПАКЕТЫ ===
    { id:'d1', name:'Дрип-пакеты Бэрри (10 шт)', category:'Дрип-пакеты', price:370, unit:'10 шт', weight:0.1, code:'00-00007177' },
    { id:'d2', name:'Дрип-пакеты Бэрри (30 шт)', category:'Дрип-пакеты', price:1030, unit:'30 шт', weight:0.3, code:'00-00010222' },
    { id:'d3', name:'Дрип-пакеты Бэрри (50 шт)', category:'Дрип-пакеты', price:1580, unit:'50 шт', weight:0.5, code:'00-00013429' },
    { id:'d4', name:'Дрип-пакеты Руанда Киву (10 шт)', category:'Дрип-пакеты', price:380, unit:'10 шт', weight:0.1, code:'00-00008254' },
    { id:'d5', name:'Дрип-пакеты Руанда Киву (50 шт)', category:'Дрип-пакеты', price:1600, unit:'50 шт', weight:0.5, code:'00-00013433' },
    { id:'d6', name:'Дрип-пакеты Гватемала Сантьяго (10 шт)', category:'Дрип-пакеты', price:390, unit:'10 шт', weight:0.1, code:'00-00013486' },
    { id:'d7', name:'Дрип-пакеты Гватемала Сантьяго (30 шт)', category:'Дрип-пакеты', price:1090, unit:'30 шт', weight:0.3, code:'00-00013715' },
    { id:'d8', name:'Дрип-пакеты Бразилия Суль-де-Минас (10 шт)', category:'Дрип-пакеты', price:380, unit:'10 шт', weight:0.1, code:'00-00013487' },
    { id:'d9', name:'Дрип-пакеты Бразилия Суль-де-Минас (30 шт)', category:'Дрип-пакеты', price:1050, unit:'30 шт', weight:0.3, code:'00-00013714' },
    { id:'d10', name:'Дрип-пакеты Колумбия Декаф (10 шт)', category:'Дрип-пакеты', price:440, unit:'10 шт', weight:0.1, code:'00-00008563' },
    { id:'d11', name:'Дрип-пакеты Колумбия Уила (10 шт)', category:'Дрип-пакеты', price:390, unit:'10 шт', weight:0.1, code:'' },
    { id:'d12', name:'Дрип-пакеты Эфиопия Сидамо (10 шт)', category:'Дрип-пакеты', price:420, unit:'10 шт', weight:0.1, code:'' },
    { id:'d13', name:'Дрип-пакеты Индонезия Суматра Гайо (10 шт)', category:'Дрип-пакеты', price:430, unit:'10 шт', weight:0.1, code:'' },
    { id:'d14', name:'Дрип-пакеты Кения Маунт (10 шт)', category:'Дрип-пакеты', price:390, unit:'10 шт', weight:0.1, code:'' },
    { id:'d15', name:'Микс дрип-пакетов (20 шт)', category:'Дрип-пакеты', price:940, unit:'20 шт', weight:0.2, code:'' },
    // === АКСЕССУАРЫ и СИРОПЫ ===
    { id:'a1', name:'Сироп Gourmix Амаретто (1л)', category:'Аксессуары', price:620, unit:'1 л', weight:0.2, code:'00-00010099' },
    { id:'a2', name:'Сироп Gourmix Ваниль (1л)', category:'Аксессуары', price:570, unit:'1 л', weight:0.2, code:'' },
    { id:'a3', name:'Сироп Gourmix Карамель (1л)', category:'Аксессуары', price:570, unit:'1 л', weight:0.2, code:'' },
    { id:'a4', name:'Сироп Gourmix Фундук (1л)', category:'Аксессуары', price:570, unit:'1 л', weight:0.2, code:'' },
    { id:'a5', name:'Сироп Gourmix Солёная карамель (1л)', category:'Аксессуары', price:620, unit:'1 л', weight:0.2, code:'' },
    { id:'a6', name:'Сироп Gourmix Миндаль (1л)', category:'Аксессуары', price:620, unit:'1 л', weight:0.2, code:'' },
    { id:'a7', name:'Сироп Gourmix Лаванда (1л)', category:'Аксессуары', price:620, unit:'1 л', weight:0.2, code:'' },
    { id:'a8', name:'Сироп Gourmix Каштан (1л)', category:'Аксессуары', price:725, unit:'1 л', weight:0.2, code:'' },
    { id:'a9', name:'Сухая основа "Банановое мороженое"', category:'Аксессуары', price:530, unit:'шт', weight:0.15, code:'00-00011553' },
    { id:'a10', name:'Сухая основа "Черничный пломбир"', category:'Аксессуары', price:530, unit:'шт', weight:0.15, code:'00-00014986' },
    { id:'a11', name:'Сухая основа "Крем-брюле с хурмой"', category:'Аксессуары', price:530, unit:'шт', weight:0.15, code:'' },
    { id:'a12', name:'Сухая основа "Малина-красный базилик"', category:'Аксессуары', price:530, unit:'шт', weight:0.15, code:'' },
    { id:'a13', name:'Помпа-дозатор для сиропов', category:'Аксессуары', price:330, unit:'шт', weight:0.05, code:'' }
];

// ============================================================
// ФУНКЦИЯ ЗАПОЛНЕНИЯ ТОВАРОВ (если таблица пуста)
// ============================================================
function seedProducts() {
    db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
        if (err) {
            console.error('❌ Ошибка проверки товаров:', err.message);
            return;
        }
        if (row.count === 0) {
            const stmt = db.prepare('INSERT INTO products (id, name, category, price, unit, weight, code) VALUES (?, ?, ?, ?, ?, ?, ?)');
            allProducts.forEach(p => {
                stmt.run(p.id, p.name, p.category, p.price, p.unit, p.weight, p.code);
            });
            stmt.finalize();
            console.log(`✅ Добавлено ${allProducts.length} товаров в БД`);
        } else {
            console.log(`ℹ️ В БД уже есть ${row.count} товаров`);
        }
    });
}

// === ИНИЦИАЛИЗАЦИЯ БД ===
function initDatabase() {
    db.serialize(() => {
        // Создание таблиц
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            cart TEXT NOT NULL,
            order_date TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            history TEXT DEFAULT '[]',
            status TEXT DEFAULT 'new',
            closed_date TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            orders TEXT DEFAULT '[]'
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS archives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            orders TEXT NOT NULL,
            discount INTEGER DEFAULT 10
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS verification_codes (
            email TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            price REAL NOT NULL,
            unit TEXT,
            weight REAL,
            code TEXT,
            description TEXT,
            image TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_orders_closed_date ON orders(closed_date)`);

        // Настройки по умолчанию
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('is_closed', 'false'),
            ('discount', '10'),
            ('open_date', ?),
            ('sender_email', '')`, [new Date().toISOString()]);

        // Создание админа
        createDefaultAdmin();

        // Заполнение товарами
        seedProducts();
    });
}

// === СОЗДАНИЕ АДМИНА ===
async function createDefaultAdmin() {
    try {
        const hash = await bcrypt.hash('admin2026', 10);
        db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)',
            ['admin', hash],
            (err) => {
                if (err) console.error('❌ Ошибка создания админа:', err.message);
                else console.log('✅ Админ создан (пароль: admin2026)');
                initMailer();
                startServer();
            }
        );
    } catch (e) {
        console.error('❌ Ошибка хеширования пароля:', e.message);
        initMailer();
        startServer();
    }
}

// === ЗАПУСК СЕРВЕРА ===
let serverStarted = false;

function startServer() {
    if (serverStarted) return;
    serverStarted = true;

    // === MIDDLEWARE ===
    const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        process.env.ORIGIN,
        'https://tasty-coffee-production.up.railway.app'
    ].filter(Boolean);

    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    }));

    app.set('trust proxy', 1);
    app.use(express.json({ limit: '10mb' }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        }
    }));

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    function getSetting(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            });
        });
    }

    function setSetting(key, value) {
        return new Promise((resolve, reject) => {
            db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                [key, value],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async function getSettings() {
        try {
            const isClosed = await getSetting('is_closed') === 'true';
            const discount = parseInt(await getSetting('discount')) || 10;
            const openDate = await getSetting('open_date') || new Date().toISOString();
            const senderEmail = await getSetting('sender_email') || '';
            return { isClosed, discount, openDate, senderEmail };
        } catch (e) {
            console.error('Ошибка получения настроек:', e.message);
            return { isClosed: false, discount: 10, openDate: new Date().toISOString(), senderEmail: '' };
        }
    }

    function isAuthenticated(req, res, next) {
        if (req.session && req.session.isAdmin) {
            next();
        } else {
            res.status(401).json({ error: 'Не авторизован' });
        }
    }

    // === ПУБЛИЧНЫЙ API ТОВАРОВ ===
    app.get('/api/products', (req, res) => {
        db.all('SELECT id, name, category, price, unit, weight, code, description FROM products ORDER BY name', (err, products) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ products });
        });
    });

    // === ВЕРИФИКАЦИЯ ===
    app.post('/api/send-code', async (req, res) => {
        const { email, phone } = req.body;
        if (!email || !phone) {
            return res.status(400).json({ error: 'Email и телефон обязательны' });
        }
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const now = Date.now();
        const expires = now + 5 * 60 * 1000;
        db.run(
            'INSERT OR REPLACE INTO verification_codes (email, code, created_at, expires_at) VALUES (?, ?, ?, ?)',
            [email, code, now, expires],
            (err) => {
                if (err) {
                    console.error('Ошибка сохранения кода:', err.message);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                res.json({ success: true, code: code, message: 'Код отправлен на email' });
            }
        );
    });

    app.post('/api/verify-code', (req, res) => {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ error: 'Email и код обязательны' });
        }
        db.get('SELECT * FROM verification_codes WHERE email = ?', [email], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (!row) {
                return res.status(400).json({ error: 'Код не найден или истёк' });
            }
            if (Date.now() > row.expires_at) {
                return res.status(400).json({ error: 'Код истёк, запросите новый' });
            }
            if (row.code !== code) {
                return res.status(400).json({ error: 'Неверный код' });
            }
            db.run('DELETE FROM verification_codes WHERE email = ?', [email]);
            req.session.verified = true;
            req.session.verifiedEmail = email;
            req.session.verifiedPhone = req.body.phone || '';
            res.json({ success: true, message: 'Верификация успешна' });
        });
    });

    // === АУТЕНТИФИКАЦИЯ ===
    app.get('/api/auth/status', async (req, res) => {
        try {
            const settings = await getSettings();
            res.json({
                isAuthenticated: req.session && req.session.isAdmin === true,
                isClosed: settings.isClosed,
                discount: settings.discount,
                openDate: settings.openDate,
                senderEmail: settings.senderEmail
            });
        } catch (e) {
            res.status(500).json({ error: 'Ошибка получения настроек' });
        }
    });

    app.post('/api/auth/login', async (req, res) => {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Пароль обязателен' });
        }
        try {
            db.get('SELECT password_hash FROM admins WHERE username = ?', ['admin'], async (err, row) => {
                if (err || !row) {
                    return res.status(401).json({ error: 'Неверный пароль' });
                }
                const isValid = await bcrypt.compare(password, row.password_hash);
                if (isValid) {
                    req.session.isAdmin = true;
                    req.session.userId = 'admin';
                    req.session.save(async (err) => {
                        if (err) {
                            console.error('Ошибка сохранения сессии:', err);
                            return res.status(500).json({ error: 'Ошибка сохранения сессии' });
                        }
                        const settings = await getSettings();
                        res.json({
                            success: true,
                            isAuthenticated: true,
                            isClosed: settings.isClosed,
                            discount: settings.discount,
                            senderEmail: settings.senderEmail
                        });
                    });
                } else {
                    res.status(401).json({ error: 'Неверный пароль' });
                }
            });
        } catch (e) {
            res.status(500).json({ error: 'Ошибка проверки пароля' });
        }
    });

    app.post('/api/auth/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Ошибка выхода:', err);
                return res.status(500).json({ error: 'Ошибка выхода' });
            }
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });

    app.post('/api/auth/change-password', isAuthenticated, async (req, res) => {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Пароль должен содержать минимум 4 символа' });
        }
        try {
            const hash = await bcrypt.hash(newPassword, 10);
            db.run('UPDATE admins SET password_hash = ? WHERE username = ?',
                [hash, 'admin'],
                (err) => {
                    if (err) {
                        res.status(500).json({ error: 'Ошибка смены пароля' });
                    } else {
                        res.json({ success: true, message: 'Пароль изменён' });
                    }
                }
            );
        } catch (e) {
            res.status(500).json({ error: 'Ошибка смены пароля' });
        }
    });

    // === НАСТРОЙКА EMAIL ОТПРАВИТЕЛЯ ===
    app.post('/api/admin/sender-email', isAuthenticated, (req, res) => {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Введите корректный email' });
        }
        setSetting('sender_email', email).then(() => {
            res.json({ success: true, message: 'Email отправителя обновлён' });
        }).catch((err) => {
            res.status(500).json({ error: 'Ошибка сохранения email' });
        });
    });

    app.get('/api/admin/sender-email', isAuthenticated, async (req, res) => {
        try {
            const email = await getSetting('sender_email');
            res.json({ email: email || '' });
        } catch (e) {
            res.status(500).json({ error: 'Ошибка получения email' });
        }
    });

    // === CRUD ТОВАРОВ (админ) ===
    app.get('/api/admin/products', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM products ORDER BY name', (err, products) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ products });
        });
    });

    app.post('/api/admin/products', isAuthenticated, (req, res) => {
        const { name, category, price, unit, weight, code, description } = req.body;
        if (!name || price === undefined) {
            return res.status(400).json({ error: 'Название и цена обязательны' });
        }
        const id = 'p' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        db.run(
            `INSERT INTO products (id, name, category, price, unit, weight, code, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, category, price, unit, weight, code, description],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id });
            }
        );
    });

    app.put('/api/admin/products/:id', isAuthenticated, (req, res) => {
        const { name, category, price, unit, weight, code, description } = req.body;
        db.run(
            `UPDATE products SET name=?, category=?, price=?, unit=?, weight=?, code=?, description=?
             WHERE id = ?`,
            [name, category, price, unit, weight, code, description, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    app.delete('/api/admin/products/:id', isAuthenticated, (req, res) => {
        db.run('DELETE FROM products WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    // === АНАЛИТИКА БЕСТСЕЛЛЕРОВ ===
    app.get('/api/analytics/bestsellers', isAuthenticated, (req, res) => {
        db.all(`SELECT cart, status FROM orders WHERE status IN ('closed', 'completed')`, (err, orders) => {
            if (err) return res.status(500).json({ error: err.message });
            const productCount = {};
            orders.forEach(order => {
                try {
                    const cart = JSON.parse(order.cart || '[]');
                    cart.forEach(item => {
                        const id = item.productId;
                        const qty = item.quantity || 1;
                        productCount[id] = (productCount[id] || 0) + qty;
                    });
                } catch(e) {}
            });
            const ids = Object.keys(productCount);
            if (ids.length === 0) {
                return res.json({ bestsellers: [] });
            }
            const placeholders = ids.map(() => '?').join(',');
            db.all(`SELECT id, name, price FROM products WHERE id IN (${placeholders})`, ids, (err, products) => {
                if (err) return res.status(500).json({ error: err.message });
                const result = products.map(p => ({
                    ...p,
                    total_quantity: productCount[p.id] || 0
                })).sort((a, b) => b.total_quantity - a.total_quantity);
                res.json({ bestsellers: result });
            });
        });
    });

    // === ИНДИВИДУАЛЬНЫЙ СТАТУС ЗАКАЗА ===
    app.patch('/api/admin/orders/:id/status', isAuthenticated, (req, res) => {
        const { status } = req.body;
        const allowed = ['new', 'processing', 'shipped', 'closed', 'cancelled'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: 'Недопустимый статус' });
        }
        const closedDate = status === 'closed' ? new Date().toISOString() : null;
        db.run(
            `UPDATE orders SET status = ?, closed_date = ? WHERE id = ?`,
            [status, closedDate, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // === ЗАКАЗЫ ===
    app.get('/api/orders', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM orders ORDER BY order_date DESC', async (err, orders) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения заказов' });
            }
            db.all('SELECT * FROM participants', (err2, participants) => {
                if (err2) {
                    return res.status(500).json({ error: 'Ошибка получения участников' });
                }
                getSettings().then(settings => {
                    db.all('SELECT * FROM archives ORDER BY date DESC', (err3, archives) => {
                        if (err3) {
                            return res.status(500).json({ error: 'Ошибка получения архивов' });
                        }
                        const parsedOrders = (orders || []).map(o => {
                            try {
                                return {
                                    ...o,
                                    cart: JSON.parse(o.cart || '[]'),
                                    history: JSON.parse(o.history || '[]')
                                };
                            } catch (e) {
                                return { ...o, cart: [], history: [] };
                            }
                        });
                        res.json({
                            orders: parsedOrders,
                            participants: (participants || []).map(p => {
                                try {
                                    return {
                                        ...p,
                                        orders: JSON.parse(p.orders || '[]')
                                    };
                                } catch (e) {
                                    return { ...p, orders: [] };
                                }
                            }),
                            isClosed: settings.isClosed,
                            discount: settings.discount,
                            openDate: settings.openDate,
                            archive: (archives || []).map(a => {
                                try {
                                    return {
                                        ...a,
                                        orders: JSON.parse(a.orders || '[]')
                                    };
                                } catch (e) {
                                    return { ...a, orders: [] };
                                }
                            })
                        });
                    });
                }).catch(() => {
                    res.status(500).json({ error: 'Ошибка получения настроек' });
                });
            });
        });
    });

    // === СОЗДАНИЕ ЗАКАЗА (сокращённый ID) ===
    app.post('/api/orders', async (req, res) => {
        const { email, phone, cart } = req.body;
        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста' });
        }
        if (!req.session.verified) {
            return res.status(403).json({ error: 'Требуется верификация. Запросите код и подтвердите его.' });
        }
        try {
            const settings = await getSettings();
            if (settings.isClosed) {
                return res.status(403).json({ error: 'Закупка закрыта' });
            }

            // --- Генерация ID в формате ZK-{YYMMDD}{4-значный код} ---
            const now = new Date();
            const dateStr = now.getFullYear().toString().slice(-2) +
                            String(now.getMonth() + 1).padStart(2, '0') +
                            String(now.getDate()).padStart(2, '0');
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const orderId = `ZK-${dateStr}${randomNum}`;

            const orderDate = new Date().toLocaleString('ru-RU');
            const cartJson = JSON.stringify(cart);
            const historyJson = JSON.stringify([{ cart: cart, date: orderDate }]);

            const name = phone || 'Клиент';
            const status = 'new';

            db.run(
                `INSERT INTO orders (id, name, email, phone, cart, order_date, version, history, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, name, email, phone, cartJson, orderDate, 1, historyJson, status],
                async (err) => {
                    if (err) {
                        console.error('Ошибка вставки заказа:', err.message);
                        return res.status(500).json({ error: 'Ошибка создания заказа' });
                    }
                    // Обновляем участника
                    db.get('SELECT * FROM participants WHERE email = ?', [email], (err2, participant) => {
                        if (err2) return;
                        if (participant) {
                            try {
                                const orders = JSON.parse(participant.orders || '[]');
                                orders.unshift({ id: orderId, date: orderDate, cart: cart });
                                if (orders.length > 3) orders.pop();
                                db.run('UPDATE participants SET name = ?, phone = ?, orders = ? WHERE email = ?',
                                    [name, phone || '', JSON.stringify(orders), email]);
                            } catch (e) {
                                console.error('Ошибка обновления участника:', e.message);
                            }
                        } else {
                            const orders = [{ id: orderId, date: orderDate, cart: cart }];
                            db.run('INSERT INTO participants (name, email, phone, orders) VALUES (?, ?, ?, ?)',
                                [name, email, phone || '', JSON.stringify(orders)]);
                        }
                    });

                    // Отправка письма через Nodemailer
                    if (transporter) {
                        try {
                            const fromEmail = await getSetting('sender_email') || process.env.SMTP_FROM || process.env.SMTP_USER;
                            const orderText = generateOrderEmail(name, email, phone, cart, orderId, orderDate);
                            await transporter.sendMail({
                                from: fromEmail,
                                to: email,
                                subject: 'Ваш заказ Tasty Coffee',
                                text: orderText,
                                html: orderText.replace(/\n/g, '<br>')
                            });
                            console.log('✅ Письмо отправлено на', email);
                        } catch (err) {
                            console.error('❌ Ошибка отправки письма:', err);
                        }
                    } else {
                        console.warn('⚠️ SMTP не настроен, письмо не отправлено');
                    }

                    res.json({
                        success: true,
                        order: {
                            id: orderId,
                            name: name,
                            email: email,
                            phone: phone,
                            cart: cart,
                            orderDate: orderDate,
                            version: 1,
                            history: [{ cart: cart, date: orderDate }],
                            status: status
                        }
                    });
                }
            );
        } catch (e) {
            console.error('Ошибка создания заказа:', e.message);
            res.status(500).json({ error: 'Ошибка создания заказа' });
        }
    });

    function generateOrderEmail(name, email, phone, cart, orderId, orderDate) {
        const items = cart.map(item => {
            return `  ${item.quantity} шт. х ${item.productId}`;
        }).join('\n');
        return `=== ПЕРСОНАЛЬНЫЙ СЧЁТ TASTY COFFEE ===\nДата: ${orderDate}\nКлиент: ${name}\nEmail: ${email}\nТелефон: ${phone}\n----------------------------------------\n${items}\n----------------------------------------\nИтого: ${cart.reduce((sum, i) => sum + (i.quantity || 0)*100, 0)} ₽\nВаш ID: ${orderId}`;
    }

    app.get('/api/orders/:id', (req, res) => {
        db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, order) => {
            if (err || !order) {
                return res.status(404).json({ error: 'Заказ не найден' });
            }
            try {
                res.json({
                    order: {
                        ...order,
                        cart: JSON.parse(order.cart || '[]'),
                        history: JSON.parse(order.history || '[]')
                    }
                });
            } catch (e) {
                res.json({ order: { ...order, cart: [], history: [] } });
            }
        });
    });

    app.put('/api/orders/:id', async (req, res) => {
        try {
            const settings = await getSettings();
            if (settings.isClosed) {
                return res.status(403).json({ error: 'Закупка закрыта' });
            }
            const { email, phone, cart } = req.body;
            if (!cart || cart.length === 0) {
                return res.status(400).json({ error: 'Корзина пуста' });
            }
            db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, order) => {
                if (err || !order) {
                    return res.status(404).json({ error: 'Заказ не найден' });
                }
                const version = order.version + 1;
                let history = [];
                try {
                    history = JSON.parse(order.history || '[]');
                } catch (e) {
                    history = [];
                }
                history.push({ cart: cart, date: new Date().toLocaleString('ru-RU') });

                const name = phone || order.name;

                db.run(
                    `UPDATE orders SET 
                        name = ?, email = ?, phone = ?, cart = ?, 
                        version = ?, history = ? 
                     WHERE id = ?`,
                    [
                        name || order.name,
                        email || order.email,
                        phone || order.phone,
                        JSON.stringify(cart),
                        version,
                        JSON.stringify(history),
                        req.params.id
                    ],
                    (err2) => {
                        if (err2) {
                            return res.status(500).json({ error: 'Ошибка обновления заказа' });
                        }
                        if (email && email !== '—') {
                            db.get('SELECT * FROM participants WHERE email = ?', [email], (err3, participant) => {
                                if (err3 || !participant) return;
                                try {
                                    const orders = JSON.parse(participant.orders || '[]');
                                    const existing = orders.find(o => o.id === req.params.id);
                                    if (existing) {
                                        existing.cart = cart;
                                        existing.date = new Date().toLocaleString('ru-RU');
                                    }
                                    db.run('UPDATE participants SET name = ?, phone = ?, orders = ? WHERE email = ?',
                                        [name, phone || '', JSON.stringify(orders), email]);
                                } catch (e) {
                                    console.error('Ошибка обновления участника:', e.message);
                                }
                            });
                        }
                        res.json({
                            success: true,
                            order: {
                                ...order,
                                name: name || order.name,
                                email: email || order.email,
                                phone: phone || order.phone,
                                cart: cart,
                                version: version,
                                history: history,
                                status: order.status || 'new'
                            }
                        });
                    }
                );
            });
        } catch (e) {
            res.status(500).json({ error: 'Ошибка обновления заказа' });
        }
    });

    app.get('/api/participants/:email', (req, res) => {
        db.get('SELECT * FROM participants WHERE email = ?', [req.params.email], (err, participant) => {
            if (err || !participant) {
                return res.status(404).json({ error: 'Участник не найден' });
            }
            try {
                res.json({
                    participant: {
                        ...participant,
                        orders: JSON.parse(participant.orders || '[]')
                    }
                });
            } catch (e) {
                res.json({ participant: { ...participant, orders: [] } });
            }
        });
    });

    app.get('/api/admin/participants', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM participants', (err, participants) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения участников' });
            }
            res.json({
                participants: (participants || []).map(p => {
                    try {
                        return {
                            ...p,
                            orders: JSON.parse(p.orders || '[]')
                        };
                    } catch (e) {
                        return { ...p, orders: [] };
                    }
                })
            });
        });
    });

    app.post('/api/admin/close', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM orders', (err, orders) => {
            if (err || !orders || orders.length === 0) {
                return res.status(400).json({ error: 'Нет заказов для закрытия' });
            }
            const archiveDate = new Date().toLocaleString('ru-RU');
            const archiveData = JSON.stringify((orders || []).map(o => {
                try {
                    return {
                        ...o,
                        cart: JSON.parse(o.cart || '[]')
                    };
                } catch (e) {
                    return { ...o, cart: [] };
                }
            }));

            db.run(
                'INSERT INTO archives (date, orders, discount) VALUES (?, ?, ?)',
                [archiveDate, archiveData, 10],
                (err2) => {
                    if (err2) {
                        return res.status(500).json({ error: 'Ошибка архивации' });
                    }
                    setSetting('is_closed', 'true').then(() => {
                        db.all('SELECT * FROM archives ORDER BY date DESC', (err3, archives) => {
                            res.json({
                                success: true,
                                isClosed: true,
                                archive: (archives || []).map(a => {
                                    try {
                                        return {
                                            ...a,
                                            orders: JSON.parse(a.orders || '[]')
                                        };
                                    } catch (e) {
                                        return { ...a, orders: [] };
                                    }
                                })
                            });
                        });
                    }).catch(() => {
                        res.status(500).json({ error: 'Ошибка закрытия' });
                    });
                }
            );
        });
    });

    app.post('/api/admin/discount', isAuthenticated, (req, res) => {
        const { discount } = req.body;
        if (discount === undefined || discount < 0 || discount > 100) {
            return res.status(400).json({ error: 'Скидка должна быть от 0 до 100' });
        }
        setSetting('discount', String(discount)).then(() => {
            res.json({ success: true, discount: discount });
        }).catch(() => {
            res.status(500).json({ error: 'Ошибка обновления скидки' });
        });
    });

    app.get('/api/admin/archive', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM archives ORDER BY date DESC', (err, archives) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения архива' });
            }
            res.json({
                archive: (archives || []).map(a => {
                    try {
                        return {
                            ...a,
                            orders: JSON.parse(a.orders || '[]')
                        };
                    } catch (e) {
                        return { ...a, orders: [] };
                    }
                })
            });
        });
    });

    app.get('/api/admin/export', isAuthenticated, (req, res) => {
        db.all('SELECT * FROM orders', (err, orders) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка экспорта' });
            }
            const data = (orders || []).map(o => {
                let cart = [];
                try {
                    cart = JSON.parse(o.cart || '[]');
                } catch (e) {
                    cart = [];
                }
                const totalWeight = cart.reduce((sum, item) => {
                    return sum + (item.quantity || 0) * 0.25;
                }, 0);
                return {
                    'ID': o.id,
                    'ФИО': o.name,
                    'Email': o.email,
                    'Дата': o.order_date,
                    'Версия': o.version,
                    'Вес (кг)': totalWeight.toFixed(2),
                    'Статус': o.status || 'new'
                };
            });
            res.json({ data: data });
        });
    });

    app.post('/api/admin/notify-start', isAuthenticated, (req, res) => {
        db.all('SELECT email FROM participants WHERE email IS NOT NULL AND email != ?', ['—'], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения email' });
            }
            const emails = (rows || []).map(r => r.email).filter(e => e && e.includes('@'));
            res.json({
                success: true,
                emails: emails,
                count: emails.length
            });
        });
    });

    // === СТАТИКА ===
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // === ЗАПУСК ===
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 Сервер запущен на порту ${PORT}`);
        console.log(`🔐 Пароль администратора: admin2026`);
        console.log(`📁 БД: ${DB_PATH}\n`);
    });
}

setTimeout(() => {
    if (!serverStarted) {
        console.log('⚠️ Инициализация БД затянулась, принудительный запуск...');
        startServer();
    }
}, 5000);
