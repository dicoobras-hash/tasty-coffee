const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
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

// === ИНИЦИАЛИЗАЦИЯ БД ===
function initDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            cart TEXT NOT NULL,
            order_date TEXT NOT NULL,
            version INTEGER DEFAULT 1,
            history TEXT DEFAULT '[]'
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

        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('is_closed', 'false'),
            ('discount', '10'),
            ('open_date', ?),
            ('sender_email', '')`, [new Date().toISOString()]);

        createDefaultAdmin();
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
                startServer();
            }
        );
    } catch (e) {
        console.error('❌ Ошибка хеширования пароля:', e.message);
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
            secure: false,
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
                return res.status(500).json({ error: 'Ошибка выхода' });
            }
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
            const orderId = 'TK-' + Date.now().toString(36).toUpperCase() +
                Math.random().toString(36).substr(2, 4).toUpperCase();
            const orderDate = new Date().toLocaleString('ru-RU');
            const cartJson = JSON.stringify(cart);
            const historyJson = JSON.stringify([{ cart: cart, date: orderDate }]);

            const name = phone || 'Клиент';

            db.run(
                `INSERT INTO orders (id, name, email, phone, cart, order_date, version, history) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, name, email, phone, cartJson, orderDate, 1, historyJson],
                async (err) => {
                    if (err) {
                        console.error('Ошибка вставки заказа:', err.message);
                        return res.status(500).json({ error: 'Ошибка создания заказа' });
                    }
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
                            history: [{ cart: cart, date: orderDate }]
                        }
                    });
                }
            );
        } catch (e) {
            console.error('Ошибка создания заказа:', e.message);
            res.status(500).json({ error: 'Ошибка создания заказа' });
        }
    });

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
                                history: history
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
                    'Вес (кг)': totalWeight.toFixed(2)
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
