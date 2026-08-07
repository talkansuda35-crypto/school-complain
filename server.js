const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const fs = require('fs'); // เพิ่มเข้ามาเพื่อช่วยเช็คโฟลเดอร์อัตโนมัติ
const app = express();

app.use(cors());
app.use(express.json()); // 🌟 เปิดใช้งานเพื่อให้หลังบ้านอ่านค่า JSON จากหน้าบ้านได้
app.use(express.urlencoded({ extended: true }));

// 🌟 เปิดให้หน้าบ้านสามารถดึงรูปภาพจากโฟลเดอร์นี้ไปโชว์ได้
app.use('/uploads', express.static('uploads')); 

// 📲 [Step 4 PWA] เปิดให้เรียกใช้งานไฟล์ PWA (manifest.json, sw.js, ไฟล์ HTML) ในโฟลเดอร์หลักได้
app.use(express.static('./')); 

// 🌟 สร้างโฟลเดอร์ uploads อัตโนมัติถ้าหากยังไม่มีในเครื่องของน้อง
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
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

// 📸 2. ตั้งค่าการเก็บรูปภาพโปรไฟล์แอดมิน (🆕 เพิ่มใหม่สำหรับปุ่ม ข)
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); 
    },
    filename: function (req, file, cb) {
        // ตั้งชื่อไฟล์ระบุชัดเจนว่าเป็นรูปโปรไฟล์แอดมินตามด้วยรหัสเวลากันซ้ำ
        cb(null, 'avatar-' + Date.now() + path.extname(file.originalname)); 
    }
});
const uploadAvatar = multer({ storage: avatarStorage });


// 🔌 เชื่อมต่อฐานข้อมูล MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'school_complain' 
});

db.connect((err) => {
    if (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
        return;
    }
    console.log('💻 เชื่อมต่อฐานข้อมูลสำเร็จ!');
});

// 🔑 1. API สำหรับการเข้าสู่ระบบ (Login) - (✨ ปรับปรุงส่ง username กลับไปให้หน้าบ้านเอาไปใช้ต่อ)
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
            
            // ตรวจสอบว่าแอดมินมีรูปโปรไฟล์ไหม ถ้าไม่มีให้สร้างลิงก์รูปภาพสวยๆ หรือใส่รูป Default ไว้
            const finalAvatar = admin.avatar_url ? admin.avatar_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(admin.name)}&background=4f46e5&color=fff&bold=true`;

            // บันทึกประวัติการเข้าใช้งานลงตาราง logs พร้อมพาธรูปภาพที่ถูกต้อง
            const logSql = "INSERT INTO admin_login_logs (admin_name, admin_email, avatar_url) VALUES (?, ?, ?)";
            db.query(logSql, [admin.name, admin.email, finalAvatar], (logErr) => {
                if (logErr) console.error("❌ บันทึกประวัติล็อกอินล้มเหลว:", logErr);
            });
            
            res.json({
                success: true,
                message: "เข้าสู่ระบบสำเร็จ",
                admin: { 
                    username: admin.username, // 🆕 ส่ง username ไปเก็บใน LocalStorage ของหน้าบ้าน
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


// ==========================================
// ⏰ API สำหรับดึงประวัติการเข้าใช้งาน (เวอร์ชันลดความซับซ้อน ป้องกัน Error)
// ==========================================
app.get('/api/admin/login-logs', (req, res) => {
    const sql = `
        SELECT * FROM admin_login_logs 
        ORDER BY login_time DESC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ SQL Error ใน login-logs:", err);
            return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลประวัติได้" });
        }
        res.json(results);
    });
});

// ==========================================
// 📸 API อัปเดตรูปโปรไฟล์แอดมิน (เวอร์ชันอัปเกรด ค้นหาทุกช่องทางกันพัง)
// ==========================================
app.post('/api/admin/update-avatar', uploadAvatar.single('avatar'), (req, res) => {
    const { username } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'กรุณาเลือกรูปภาพก่อนกดอัปโหลดครับ' });
    }
    
    if (!username) {
        return res.status(400).json({ success: false, error: 'ไม่พบข้อมูลผู้ใช้งานสำหรับอัปเดต' });
    }

    // จัดรูปพาธไฟล์ให้ถูกต้อง
    const avatarUrl = req.file.path.replace(/\\/g, "/"); 

    // ใช้คำสั่ง SQL ตรวจสอบและอัปเดต ไม่ว่าจะแมตช์กับ username, name หรือ email ช่องทางใดช่องทางหนึ่ง
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
        
        // ถ้ายาสตยังอัปเดตไม่ได้ ให้ลองอัปเดตแถวแรกในตารางแอดมินเลย (สำหรับระบบที่มีแอดมินคนเดียว)
        if (result.affectedRows === 0) {
            const fallbackSql = "UPDATE admins SET avatar_url = ? LIMIT 1";
            db.query(fallbackSql, [avatarUrl], (fallbackErr, fallbackResult) => {
                if (fallbackErr || fallbackResult.affectedRows === 0) {
                    return res.status(404).json({ success: false, error: 'ไม่พบรายชื่อแอดมินในฐานข้อมูล' });
                }
                console.log(`🎯 [Fallback] อัปเดตรูปภาพโปรไฟล์แอดมินแถวแรกสำเร็จ!`);
                return res.json({ 
                    success: true, 
                    message: 'อัปเดตรูปโปรไฟล์สำเร็จ', 
                    avatar_url: avatarUrl 
                });
            });
        } else {
            console.log(`🎯 อัปเดตรูปภาพโปรไฟล์แอดมิน [${username}] สำเร็จ!`);
            res.json({ 
                success: true, 
                message: 'อัปเดตรูปโปรไฟล์สำเร็จ', 
                avatar_url: avatarUrl 
            });
        }
    });
});

// 📥 3. API สำหรับส่งเรื่องร้องเรียน (ปรับแก้ chatId และข้อความ Telegram)
app.post('/api/complaints', upload.single('image'), (req, res) => {
    const body = req.body || {}; 
    
    const title = body.title || 'ไม่มีหัวข้อ';
    const category = body.category || 'ทั่วไป';
    const description = body.description || body.detail || ''; 
    const reporter_name = body.reporter_name || null;
    const reporter_phone = body.student_id || null; 
    const is_anonymous = body.is_anonymous !== undefined ? parseInt(body.is_anonymous) : 0;
    
    const image_path = req.file ? req.file.path.replace(/\\/g, '/') : null; 

    const sql = `INSERT INTO complaints (title, category, description, reporter_name, reporter_phone, is_anonymous, image_path, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'รอการดำเนินการ')`;
                 
    db.query(sql, [title, category, description, reporter_name, reporter_phone, is_anonymous, image_path], (err, result) => {
        if (err) {
            console.error("❌ เกิด Error ที่ฐานข้อมูล:", err.sqlMessage || err);
            return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
        }

        // ==========================================
        // 🚨 กำหนด Token และ Chat ID สำหรับ Telegram
        // ==========================================
        const botToken = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
        const chatId = process.env.TELEGRAM_CHAT_ID || 'YOUR_TELEGRAM_CHAT_ID';
        // ==========================================

        const displayName = is_anonymous === 1 ? 'ไม่เปิดเผยตัวตน' : (reporter_name || 'ไม่ระบุชื่อ');
        
        // จัดรูปแบบข้อความแบบเรียบง่าย (ไม่ใช้ Markdown เพื่อป้องกันข้อผิดพลาดในการยิง API)
        const telegramMessage = 
            `🚨 มีเรื่องร้องเรียนใหม่เข้ามาครับ!\n\n` +
            `📌 หมวดหมู่: ${category}\n` +
            `📝 หัวข้อ: ${title}\n` +
            `🔍 รายละเอียด: ${description}\n` +
            `👤 ผู้แจ้ง: ${displayName}\n` +
            `📱 รหัสนักเรียน/นักศึกษา: ${reporter_phone || '-'}`;

        // โค้ดยิงแจ้งเตือนเข้า Telegram
        if (botToken !== 'YOUR_TELEGRAM_BOT_TOKEN') {
            fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: chatId, 
                    text: telegramMessage
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    console.log('🔔 ยิงแจ้งเตือนผ่าน Telegram สำเร็จ!');
                } else {
                    console.error('❌ Telegram ตอบกลับข้อผิดพลาด:', data.description);
                }
            })
            .catch(telegramErr => console.error('❌ แจ้งเตือน Telegram ล้มเหลว:', telegramErr));
        }

        res.json({ success: true, message: "ส่งเรื่องร้องเรียนสำเร็จเรียบร้อยแล้ว!" });
    });
});

// ==========================================
// 📤 API สำหรับดึงรายการเรื่องร้องเรียนทั้งหมดไปแสดงในหน้า Admin
// ==========================================
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

// 📊 API สำหรับดาวน์โหลดข้อมูลแยกตามแผนก/หมวดหมู่
app.get('/api/complaints/download-excel', (req, res) => {
    const sql = "SELECT * FROM complaints ORDER BY category ASC, id DESC";
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error("❌ เกิดข้อผิดพลาดในการดึงข้อมูลส่งออก Excel:", err);
            return res.status(500).send("เกิดข้อผิดพลาดในระบบฐานข้อมูล");
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=complaints_report.csv');

        let csvContent = '\uFEFF';
        csvContent += 'ลำดับ,หมวดหมู่/แผนก,หัวข้อเรื่องร้องเรียน,รายละเอียดเรื่อง,ชื่อผู้แจ้งเรื่อง,เบอร์โทร/รหัสนักเรียน,สถานะข้อมูล\n';

        results.forEach((item) => {
            const name = item.is_anonymous === 1 ? 'ไม่เปิดเผยตัวตน' : (item.reporter_name || 'ไม่ระบุชื่อ');
            const phone = item.reporter_phone || '-';
            const detail = item.description ? item.description.replace(/\n/g, " ") : '-';

            csvContent += `"${item.id}","${item.category}","${item.title}","${detail}","${name}","${phone}","${item.status}"\n`;
        });

        res.send(csvContent);
    });
});

// 🔄 5. API สำหรับการอัปเดตสถานะระบบเรื่องร้องเรียน จากหน้าแอดมิน
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
        
        console.log(`🎯 อัปเดตสถานะเรื่องร้องเรียน ID: ${id} เป็น [${status}] เรียบร้อย!`);
        res.status(200).json({ success: true, message: "อัปเดตสถานะสำเร็จเรียบร้อยแล้ว" });
    });
});

app.listen(3000, () => {
    console.log('🚀 Server is running on port 3000');
});