const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// 🟢 نقطة فحص الحالة
app.get('/health', (req, res) => {
  res.json({ status: "OK", message: "Activation API running!" });
});

// 📦 الحصول على جميع المنتجات
app.get('/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      products: data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
});

// ➕ إضافة منتج جديد
app.post('/admin/products', authenticateAdmin, async (req, res) => {
  const { name, version, description, price } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: "Product name is required" });
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .insert([
        {
          name,
          version: version || '1.0',
          description,
          price: price || 0
        }
      ])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Product added successfully!",
      product: data[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to add product" });
  }
});

// ✏️ تحديث منتج
app.put('/admin/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, version, description, price, is_active } = req.body;

  try {
    const { data, error } = await supabase
      .from('products')
      .update({
        name,
        version,
        description,
        price,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Product updated successfully!",
      product: data[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update product" });
  }
});


// 🔐 تسجيل مستخدم جديد (عبر البريد أو Device ID)
app.post('/register', async (req, res) => {
  const { email, device_id } = req.body;

  if (!email && !device_id) {
    return res.status(400).json({ success: false, message: "Either email or device_id is required" });
  }

  try {
    let existingUser;
    
    // البحث بالبريد الإلكتروني إذا وجد
    if (email) {
      const { data: userData, error: emailError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      existingUser = userData;
    }
    
    // البحث بمعرف الجهاز إذا لم يتم العثور على مستخدم بالبريد
    if (device_id && !existingUser) {
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

// 🔍 البحث عن المنتج بالاسم
async function findProductByName(productName) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('name', productName)
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
}

// 🔁 تفعيل المنتج
app.post('/activate', async (req, res) => {
  const { product_key, device_id, product_name } = req.body;

  if (!product_key || !device_id || !product_name) {
    return res.status(400).json({ success: false, message: "product_key, device_id, and product_name are required" });
  }

  try {
    // البحث عن المنتج
    const product = await findProductByName(product_name);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // التحقق من صحة مفتاح التفعيل
    const { data: keyData, error: keyError } = await supabase
      .from('product_keys')
      .select('*')
      .eq('key_value', product_key)
      .eq('is_used', false)
      .eq('product_id', product.id)
      .single();

    if (keyError || !keyData) {
      return res.status(404).json({ success: false, message: "Invalid or used product key" });
    }

    // البحث عن المستخدم المرتبط بالجهاز
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('device_id', device_id)
      .single();

    let userId = userData?.id;

    // إذا لم يكن المستخدم مسجلاً، ننشئ مستخدمًا جديدًا
    if (!userId) {
      const { data: newUser, error: newUserError } = await supabase
        .from('users')
        .insert([{ device_id }])
        .select()
        .single();
      
      if (newUserError) throw newUserError;
      userId = newUser.id;
    }

    // التحقق من وجود تفعيل سابق لهذا المنتج على هذا الجهاز
    const { data: existingActivation, error: activationError } = await supabase
      .from('activations')
      .select('*')
      .eq('device_id', device_id)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .single();

    if (existingActivation) {
      return res.status(400).json({ 
        success: false, 
        message: "Product already activated on this device" 
      });
    }

    // إنشاء التفعيل الجديد
    const { data: activation, error: activationInsertError } = await supabase
      .from('activations')
      .insert([
        {
          user_id: userId,
          product_id: product.id,
          device_id: device_id,
          product_key_id: keyData.id,
          activated_at: new Date().toISOString(),
          last_check: new Date().toISOString(),
          is_active: true
        }
      ])
      .select()
      .single();

    if (activationInsertError) throw activationInsertError;

    // تحديث حالة المفتاح إلى مستخدم
    const { error: keyUpdateError } = await supabase
      .from('product_keys')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString() 
      })
      .eq('id', keyData.id);

    if (keyUpdateError) throw keyUpdateError;

    res.json({
      success: true,
      message: "Product activated successfully!",
      activation_id: activation.id,
      product: product_name,
      device_id,
      activated_at: activation.activated_at
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Activation failed" });
  }
});

// 🔎 التحقق من حالة التفعيل
app.post('/verify', async (req, res) => {
  const { device_id, product_name } = req.body;

  if (!device_id || !product_name) {
    return res.status(400).json({ success: false, message: "device_id and product_name are required" });
  }

  try {
    // البحث عن المنتج
    const product = await findProductByName(product_name);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // البحث عن التفعيل النشط
    const { data: activation, error } = await supabase
      .from('activations')
      .select(`
        *,
        product_keys (key_value),
        products (name, version)
      `)
      .eq('device_id', device_id)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .single();

    if (error || !activation) {
      return res.status(404).json({ success: false, message: "No active activation found" });
    }

    // تحديث وقت آخر تحقق
    await supabase
      .from('activations')
      .update({ last_check: new Date().toISOString() })
      .eq('id', activation.id);

    res.json({
      success: true,
      message: "Activation is valid",
      activation: {
        product: activation.products.name,
        version: activation.products.version,
        device_id: activation.device_id,
        activated_at: activation.activated_at,
        key: activation.product_keys.key_value
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Verification failed" });
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
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ 
      userId: admin.id, 
      email: admin.email,
      role: 'admin',
      isSuperAdmin: admin.is_super_admin 
    }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: "Admin login successful!",
      token,
      user: { 
        email: admin.email, 
        name: admin.name,
        is_super_admin: admin.is_super_admin
      }
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

  if (!token) return res.status(401).json({ success: false, message: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid or expired token" });
    if (user.role !== 'admin') return res.status(403).json({ success: false, message: "Admin access required" });
    
    req.user = user;
    next();
  });
}

// ➕ إضافة مفتاح جديد
app.post('/admin/keys', authenticateAdmin, async (req, res) => {
  const { product_name, notes, count = 1 } = req.body;

  if (!product_name) {
    return res.status(400).json({ success: false, message: "Product name is required" });
  }

  try {
    // البحث عن المنتج
    const product = await findProductByName(product_name);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const generateKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const keys = [];
    for (let i = 0; i < count; i++) {
      const key = `${generateKey()}-${generateKey()}-${generateKey()}`;
      keys.push({
        key_value: key,
        product_id: product.id,
        is_used: false,
        created_by: req.user.email,
        notes: notes || `Generated by ${req.user.email}`
      });
    }

    const { data, error } = await supabase
      .from('product_keys')
      .insert(keys)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `Generated ${keys.length} key(s) successfully!`,
      keys: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to generate keys" });
  }
});

// 📊 الحصول على جميع المفاتيح
app.get('/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('product_keys')
      .select(`
        *,
        products (name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, keys: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch keys" });
  }
});

// 📈 الحصول على إحصائيات التفعيل
app.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    // عدد التفعيلات النشطة
    const { data: activations, error: activationsError } = await supabase
      .from('activations')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (activationsError) throw activationsError;

    // عدد المفاتيح المستخدمة وغير المستخدمة
    const { data: keys, error: keysError } = await supabase
      .from('product_keys')
      .select('is_used', { count: 'exact' });

    if (keysError) throw keysError;

    const usedKeys = keys.filter(k => k.is_used).length;
    const unusedKeys = keys.length - usedKeys;

    // عدد المنتجات
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*', { count: 'exact' });

    if (productsError) throw productsError;

    res.json({
      success: true,
      stats: {
        total_activations: activations.length,
        used_keys: usedKeys,
        unused_keys: unusedKeys,
        total_products: products.length
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch statistics" });
  }
});

// 🚀 تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🚀 Activation API running on http://localhost:${PORT}`);
});

// إنشاء مشرف افتراضي إذا لم يكن موجودًا (للتطوير)
async function createDefaultAdmin() {
  try {
    const { data: existingAdmin } = await supabase
      .from('admins')
      .select('*')
      .eq('email', 'admin@example.com')
      .single();

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await supabase
        .from('admins')
        .insert([
          {
            email: 'admin@example.com',
            password_hash: passwordHash,
            name: 'System Administrator',
            is_super_admin: true
          }
        ]);
      
      console.log('Default admin created: admin@example.com / admin123');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
}

createDefaultAdmin();
