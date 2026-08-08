const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🌟 เปิดให้หน้าบ้านดึงรูปภาพไปโชว์ได้
app.use('/uploads', express.static('uploads')); 

// 📲 เปิดให้เรียกใช้งานไฟล์ static / PWA
app.use(express.static('./')); 

// 🌟 สร้างโฟลเดอร์ uploads อัตโนมัติถ้าหากยังไม่มี
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 📸 1. ตั้งค่าการเก็บรูปภาพหลักฐานเรื่องร้องเรียน
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// 📸 2. ตั้งค่าการเก็บรูปภาพโปรไฟล์แอดมิน
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, 'avatar-' + Date.now() + path.extname(file.originalname)); 
    }
});
const uploadAvatar = multer({ storage: avatarStorage });

// 🔌 เชื่อมต่อฐานข้อมูล MySQL (รองรับทั้ง Local, Render และ Aiven Cloud)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'school_complain',
    port: process.env.DB_PORT || 3306,
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

db.connect((err) => {
    if (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
        return;
    }
    console.log('💻 เชื่อมต่อฐานข้อมูลสำเร็จ!');

    // 🛠️ 1. สร้างตาราง complaints อัตโนมัติ
    const createComplaintsTable = `
        CREATE TABLE IF NOT EXISTS complaints (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(100) NOT NULL,
            description TEXT,
            reporter_name VARCHAR(255) DEFAULT NULL,
            reporter_phone VARCHAR(100) DEFAULT NULL,
            is_anonymous TINYINT(1) DEFAULT 0,
            image_path VARCHAR(255) DEFAULT NULL,
            status VARCHAR(50) DEFAULT 'รอการดำเนินการ',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.query(createComplaintsTable, (err) => {
        if (err) console.error("❌ สร้างตาราง complaints ไม่สำเร็จ:", err.message);
    });

    // 🛠️ 2. สร้างตาราง admins และเพิ่ม Admin เริ่มต้นให้อัตโนมัติ
    const createAdminsTable = `
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) DEFAULT NULL,
            avatar_url VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.query(createAdminsTable, (tableErr) => {
        if (!tableErr) {
            const insertDefaultAdmin = `
                INSERT IGNORE INTO admins (username, password, name, email) 
                VALUES ('admin', 'admin', 'ผู้ดูแลระบบ', 'admin@school.com')
            `;
            db.query(insertDefaultAdmin);
        } else {
            console.error("❌ สร้างตาราง admins ไม่สำเร็จ:", tableErr.message);
        }
    });

    // 🛠️ 3. สร้างตาราง admin_login_logs อัตโนมัติ
    const createLogsTable = `
        CREATE TABLE IF NOT EXISTS admin_login_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_name VARCHAR(255) NOT NULL,
            admin_email VARCHAR(255) DEFAULT NULL,
            avatar_url VARCHAR(255) DEFAULT NULL,
            login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.query(createLogsTable, (err) => {
        if (err) console.error("❌ สร้างตาราง admin_login_logs ไม่สำเร็จ:", err.message);
    });
});

// 🔑 1. API สำหรับการเข้าสู่ระบบ (Login)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT id, username, name, email, avatar_url FROM admins WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, result) => {
        if (err) {
            console.error("❌ เกิดข้อผิดพลาดในระบบฐานข้อมูล (Login):", err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในระบบฐานข้อมูล" });
        }
        
        if (result.length > 0) {
            const admin = result[0];
            const finalAvatar = admin.avatar_url ? admin.avatar_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.name)}&background=4f46e5&color=fff&bold=true`;

            const logSql = "INSERT INTO admin_login_logs (admin_name, admin_email, avatar_url) VALUES (?, ?, ?)";
            db.query(logSql, [admin.name, admin.email, finalAvatar], (logErr) => {
                if (logErr) console.error("❌ บันทึกประวัติล็อกอินล้มเหลว:", logErr);
            });
            
            res.json({
                success: true,
                message: "เข้าสู่ระบบสำเร็จ",
                admin: { 
                    username: admin.username,
                    name: admin.name, 
                    email: admin.email, 
                    avatar_url: admin.avatar_url 
                }
            });
        } else {
            res.json({ success: false, message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" });
        }
    });
});

// ⏰ API ดึงประวัติการเข้าใช้งาน
app.get('/api/admin/login-logs', (req, res) => {
    const sql = `SELECT * FROM admin_login_logs ORDER BY login_time DESC`;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ SQL Error ใน login-logs:", err);
            return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลประวัติได้" });
        }
        res.json(results);
    });
});

// 📸 API อัปเดตรูปโปรไฟล์แอดมิน
app.post('/api/admin/update-avatar', uploadAvatar.single('avatar'), (req, res) => {
    const { username } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'กรุณาเลือกรูปภาพก่อนกดอัปโหลดครับ' });
    }

    const avatarUrl = req.file.path.replace(/\\/g, "/"); 

    const sql = `
        UPDATE admins 
        SET avatar_url = ? 
        WHERE username = ? OR name = ? OR email = ?
    `;
    
    db.query(sql, [avatarUrl, username, username, username], (err, result) => {
        if (err) {
            console.error("❌ เกิดข้อผิดพลาดใน DB:", err);
            return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกฐานข้อมูล' });
        }
        
        res.json({ 
            success: true, 
            message: 'อัปเดตรูปโปรไฟล์สำเร็จ', 
            avatar_url: avatarUrl 
        });
    });
});

// 📥 3. API สำหรับส่งเรื่องร้องเรียน
app.post('/api/complaints', upload.single('image'), (req, res) => {
    const body = req.body || {}; 
    
    const title = body.title || 'ไม่มีหัวข้อ';
    const category = body.category || 'ทั่วไป';
    const description = body.description || body.detail || ''; 
    const reporter_name = body.reporter_name || null;
    const reporter_phone = body.student_id || body.reporter_phone || null; 
    const is_anonymous = body.is_anonymous !== undefined ? parseInt(body.is_anonymous) : 0;
    
    const image_path = req.file ? req.file.path.replace(/\\/g, '/') : null; 

    const sql = `INSERT INTO complaints (title, category, description, reporter_name, reporter_phone, is_anonymous, image_path, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'รอการดำเนินการ')`;
                 
    db.query(sql, [title, category, description, reporter_name, reporter_phone, is_anonymous, image_path], (err, result) => {
        if (err) {
            console.error("❌ เกิด Error ที่ฐานข้อมูล:", err.sqlMessage || err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + (err.sqlMessage || err.message) });
        }

        res.json({ success: true, message: "ส่งเรื่องร้องเรียนสำเร็จเรียบร้อยแล้ว!" });

        // 📲 แจ้งเตือนเข้า Telegram (Background Process)
        try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (botToken && chatId) {
                const displayName = is_anonymous === 1 ? 'ไม่เปิดเผยตัวตน' : (reporter_name || 'ไม่ระบุชื่อ');
                const telegramMessage = 
                    `🚨 มีเรื่องร้องเรียนใหม่เข้ามาครับ!\n\n` +
                    `📌 หมวดหมู่: ${category}\n` +
                    `📝 หัวข้อ: ${title}\n` +
                    `🔍 รายละเอียด: ${description}\n` +
                    `👤 ผู้แจ้ง: ${displayName}\n` +
                    `📱 รหัสนักเรียน/นักศึกษา: ${reporter_phone || '-'}`;

                if (typeof fetch !== 'undefined') {
                    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, text: telegramMessage })
                    }).catch(tErr => console.error('❌ Telegram error:', tErr));
                }
            }
        } catch (tgError) {
            console.error('❌ เกิดข้อผิดพลาดในส่วน Telegram:', tgError);
        }
    });
});

// 📤 API ดึงรายการเรื่องร้องเรียนทั้งหมด
app.get('/api/complaints', (req, res) => {
    const sql = `SELECT * FROM complaints ORDER BY created_at DESC`;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ ดึงข้อมูลร้องเรียนล้มเหลว:", err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }
        res.json(results);
    });
});

// 📊 API สำหรับดาวน์โหลด CSV (รองรับภาษาไทย + ป้องกันฟอร์แมตพัง)
app.get('/api/complaints/download-excel', (req, res) => {
    const sql = "SELECT * FROM complaints ORDER BY category ASC, id DESC";
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ เกิดข้อผิดพลาดในการดึงข้อมูลส่งออก Excel:", err);
            return res.status(500).send("เกิดข้อผิดพลาดในระบบฐานข้อมูล");
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=complaints_report.csv');

        let csvContent = '\uFEFF'; // BOM สำหรับให้ Excel อ่านภาษาไทยถูก
        csvContent += 'ลำดับ,หมวดหมู่/แผนก,หัวข้อเรื่องร้องเรียน,รายละเอียดเรื่อง,ชื่อผู้แจ้งเรื่อง,เบอร์โทร/รหัสนักเรียน,สถานะข้อมูล\n';

        results.forEach((item) => {
            const name = (item.is_anonymous === 1 ? 'ไม่เปิดเผยตัวตน' : (item.reporter_name || 'ไม่ระบุชื่อ')).replace(/"/g, '""');
            const phone = (item.reporter_phone || '-').replace(/"/g, '""');
            const detail = (item.description ? item.description.replace(/\n/g, " ") : '-').replace(/"/g, '""');
            const title = (item.title || '').replace(/"/g, '""');

            csvContent += `"${item.id}","${item.category}","${title}","${detail}","${name}","${phone}","${item.status}"\n`;
        });

        res.send(csvContent);
    });
});

// 🔄 API สำหรับอัปเดตสถานะ
app.put('/api/complaints/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body; 

    if (!status) {
        return res.status(400).json({ success: false, message: "กรุณาระบุสถานะที่ต้องการเปลี่ยน" });
    }

    const sql = "UPDATE complaints SET status = ? WHERE id = ?";
    
    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error("❌ เกิดข้อผิดพลาดในการอัปเดตสถานะ:", err.sqlMessage || err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลบนระบบฐานข้อมูล" });
        }
        
        res.status(200).json({ success: true, message: "อัปเดตสถานะสำเร็จเรียบร้อยแล้ว" });
    });
});

// 🚀 สั่งรัน Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
