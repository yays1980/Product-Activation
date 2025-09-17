const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // تم إضافته لاحقًا
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// إعداد Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 🔑 سر توكن JWT
const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey1234567890';

// 🟢 نقطة فحص الحالة
app.get('/health', (req, res) => {
  res.json({ status: "OK", message: "Activation API running!" });
});

// 🔐 تسجيل مستخدم جديد (عبر البريد أو Device ID)
app.post('/register', async (req, res) => {
  const { email, device_id } = req.body;

  if (!email && !device_id) {
    return res.status(400).json({ success: false, message: "Either email or device_id is required" });
  }

  try {
    let existingUser;
    if (email) {
      const { data: userData, error: emailError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      existingUser = userData;
    }
    if (device_id) {
      const { data: userData, error: deviceIdError } = await supabase
        .from('users')
        .select('*')
        .eq('device_id', device_id)
        .single();
      existingUser = userData;
    }

    if (existingUser) {
      return res.json({
        success: true,
        message: "User already registered",
        user_id: existingUser.id
      });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{ email, device_id }])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "User registered successfully!",
      user_id: data[0].id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🔁 تفعيل المنتج (مباشر - بدون اشتراك)
app.post('/activate', async (req, res) => {
  const { product_key, device_id, product_name } = req.body;

  if (!product_key || !device_id || !product_name) {
    return res.status(400).json({ success: false, message: "product_key, device_id, and product_name are required" });
  }

  try {
    // التحقق من صحة مفتاح التفعيل
    const { data: keyData, error: keyError } = await supabase
      .from('product_keys')
      .select('*')
      .eq('key_value', product_key)
      .eq('is_used', false)
      .single();

    if (keyError || !keyData) {
      return res.status(404).json({ success: false, message: "Invalid or used product key" });
    }

    // التحقق مما إذا كان الجهاز مسجلًا مسبقًا
    const { data: existingDevice, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('device_id', device_id)
      .single();

    if (existingDevice) {
      // ✅ الجهاز مسجل — نُحدث فقط تاريخ التفعيل
      await supabase
        .from('devices')
        .update({ activated_at: new Date().toISOString(), product_name })
        .eq('id', existingDevice.id);

      // علّم المفتاح بأنه مستخدم الآن
      await supabase
        .from('product_keys')
        .update({ is_used: true })
        .eq('key_value', product_key);

      return res.json({
        success: true,
        message: "Product re-activated on this device!",
        product: product_name,
        last_activated: new Date().toISOString()
      });
    }

    // ✅ جهاز جديد — أنشئ سجلًا جديدًا
    await supabase
      .from('devices')
      .insert([
        {
          user_id: null, // يمكن ربطه لاحقًا
          device_id,
          product_name,
          activated_at: new Date().toISOString()
        }
      ]);

    // علّم المفتاح بأنه مستخدم
    await supabase
      .from('product_keys')
      .update({ is_used: true })
      .eq('key_value', product_key);

    res.json({
      success: true,
      message: "Product activated successfully on new device!",
      product: product_name,
      device_id,
      last_activated: new Date().toISOString()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Activation failed" });
  }
});

// 🔐 تسجيل دخول المشرف
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required" });
  }

  try {
    const { data: admin, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !admin || !admin.is_admin) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return res.status(407).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: "Admin login successful!",
      token,
      user: { email: admin.email }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🛡️ تحقق من صلاحية المشرف
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user.role !== 'admin') return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// ➕ إضافة مفتاح جديد (بإذن المشرف)
app.post('/admin/add-key', authenticateAdmin, async (req, res) => {
  const { product_name, notes } = req.body;

  if (!product_name) {
    return res.status(400).json({ success: false, message: "Product name is required" });
  }

  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const key = `${generateKey()}-${generateKey()}-${generateKey()}`;

  try {
    const { data, error } = await supabase
      .from('product_keys')
      .insert([
        {
          key_value: key,
          product_name,
          is_used: false,
          created_by: req.user.email,
          notes
        }
      ])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Key added successfully!",
      key: data[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to add key" });
  }
});

// ❌ حذف مفتاح (غير مستخدم فقط)
app.delete('/admin/delete-key/:key_value', authenticateAdmin, async (req, res) => {
  const { key_value } = req.params;

  try {
    const { data, error } = await supabase
      .from('product_keys')
      .select('is_used')
      .eq('key_value', key_value)
      .single();

    if (error) return res.status(404).json({ success: false, message: "Key not found" });

    if (data.is_used) {
      return res.status(400).json({ success: false, message: "Cannot delete used key" });
    }

    const { data: deleted, error: delError } = await supabase
      .from('product_keys')
      .delete()
      .eq('key_value', key_value);

    if (delError) throw delError;

    res.json({ success: true, message: "Key deleted successfully!" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete key" });
  }
});

// 📊 استرجاع جميع المفاتيح (للوحة التحكم)
app.get('/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('product_keys')
      .select(`
        *,
        users(email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, keys: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch keys" });
  }
});

// 📈 تقرير التفعيلات
app.get('/admin/reports', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activation_reports')
      .select(`
        *,
        users(email),
        subscriptions(status, current_period_end)
      `)
      .order('activated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const totalActivations = data.length;
    const activeSubs = data.filter(r => r.subscription_status === 'active').length;
    const revenue = data.reduce((sum, r) => sum + (r.payment_amount || 0), 0);

    res.json({
      success: true,
      reports: data,
      stats: {
        totalActivations,
        activeSubscribers: activeSubs,
        totalRevenue: revenue.toFixed(2)
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

// 🚀 تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🚀 Activation API running on http://localhost:${PORT}`);
});
