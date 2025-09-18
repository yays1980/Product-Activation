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

// ط¥ط¹ط¯ط§ط¯ Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ًں”‘ ط³ط± طھظˆظƒظ† JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// ًںں¢ ظ†ظ‚ط·ط© ظپط­طµ ط§ظ„ط­ط§ظ„ط©
app.get('/health', (req, res) => {
  res.json({ status: "OK", message: "Activation API running!" });
});

// ًں”گ طھط³ط¬ظٹظ„ ظ…ط³طھط®ط¯ظ… ط¬ط¯ظٹط¯ (ط¹ط¨ط± ط§ظ„ط¨ط±ظٹط¯ ط£ظˆ Device ID)
app.post('/register', async (req, res) => {
  const { email, device_id } = req.body;

  if (!email && !device_id) {
    return res.status(400).json({ success: false, message: "Either email or device_id is required" });
  }

  try {
    let existingUser;
    
    // ط§ظ„ط¨ط­ط« ط¨ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط¥ط°ط§ ظˆط¬ط¯
    if (email) {
      const { data: userData, error: emailError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      existingUser = userData;
    }
    
    // ط§ظ„ط¨ط­ط« ط¨ظ…ط¹ط±ظپ ط§ظ„ط¬ظ‡ط§ط² ط¥ط°ط§ ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ط¨ط±ظٹط¯
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

// ًں”چ ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ظ„ط§ط³ظ…
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

// ًں”چ ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ظ„ظ…ط¹ط±ظپ
async function findProductById(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
}

// ًں”پ طھظپط¹ظٹظ„ ط§ظ„ظ…ظ†طھط¬
app.post('/activate', async (req, res) => {
  const { product_key, device_id, product_name, product_id } = req.body;

  if (!product_key || !device_id || (!product_name && !product_id)) {
    return res.status(400).json({ success: false, message: "product_key, device_id, and product_name or product_id are required" });
  }

  try {
    let product;
    
    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ط³طھط®ط¯ط§ظ… ط§ظ„ظ…ط¹ط±ظپ ط£ظˆ ط§ظ„ط§ط³ظ…
    if (product_id) {
      product = await findProductById(product_id);
    } else {
      product = await findProductByName(product_name);
    }
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµط­ط© ظ…ظپطھط§ط­ ط§ظ„طھظپط¹ظٹظ„
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

    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ظ…ط±طھط¨ط· ط¨ط§ظ„ط¬ظ‡ط§ط²
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('device_id', device_id)
      .single();

    let userId = userData?.id;

    // ط¥ط°ط§ ظ„ظ… ظٹظƒظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ظ…ط³ط¬ظ„ط§ظ‹طŒ ظ†ظ†ط´ط¦ ظ…ط³طھط®ط¯ظ…ظ‹ط§ ط¬ط¯ظٹط¯ظ‹ط§
    if (!userId) {
      const { data: newUser, error: newUserError } = await supabase
        .from('users')
        .insert([{ device_id }])
        .select()
        .single();
      
      if (newUserError) throw newUserError;
      userId = newUser.id;
    }

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ طھظپط¹ظٹظ„ ط³ط§ط¨ظ‚ ظ„ظ‡ط°ط§ ط§ظ„ظ…ظ†طھط¬ ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ط¬ظ‡ط§ط²
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

    // ط¥ظ†ط´ط§ط، ط§ظ„طھظپط¹ظٹظ„ ط§ظ„ط¬ط¯ظٹط¯
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

    // طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ظ…ظپطھط§ط­ ط¥ظ„ظ‰ ظ…ط³طھط®ط¯ظ…
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
      product: product.name,
      device_id,
      activated_at: activation.activated_at
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Activation failed" });
  }
});

// ًں”ژ ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط­ط§ظ„ط© ط§ظ„طھظپط¹ظٹظ„
app.post('/verify', async (req, res) => {
  const { device_id, product_id } = req.body;

  if (!device_id || !product_id) {
    return res.status(400).json({ success: false, message: "device_id and product_id are required" });
  }

  try {
    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„طھظپط¹ظٹظ„ ط§ظ„ظ†ط´ط·
    const { data: activation, error } = await supabase
      .from('activations')
      .select(`
        *,
        product_keys (key_value),
        products (name, version)
      `)
      .eq('device_id', device_id)
      .eq('product_id', product_id)
      .eq('is_active', true)
      .single();

    if (error || !activation) {
      return res.status(404).json({ success: false, message: "No active activation found" });
    }

    // طھط­ط¯ظٹط« ظˆظ‚طھ ط¢ط®ط± طھط­ظ‚ظ‚
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

// ًں“¦ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظ†طھط¬ط§طھ
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

// ًں”گ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„ ط§ظ„ظ…ط´ط±ظپ
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

// ًں›،ï¸ڈ طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط´ط±ظپ
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

// â‍• ط¥ط¶ط§ظپط© ظ…ظپطھط§ط­ ط¬ط¯ظٹط¯
app.post('/admin/keys', authenticateAdmin, async (req, res) => {
  const { product_id, notes, count = 1 } = req.body;

  if (!product_id) {
    return res.status(400).json({ success: false, message: "Product ID is required" });
  }

  try {
    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ ط§ظ„ظ…ظ†طھط¬
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('name')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const generateKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };

    const keys = [];
    for (let i = 0; i < count; i++) {
      const key = `${generateKey()}-${generateKey()}-${generateKey()}`;
      keys.push({
        key_value: key,
        product_id: product_id,
        is_used: false,
        created_by: req.user.email,
        notes: notes || `ظ…ظپطھط§ط­ ظ„ظ€ ${product.name} - طھظ… ط¥ظ†ط´ط§ط¤ظ‡ ط¨ظˆط§ط³ط·ط© ${req.user.email}`
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

// ًں“ٹ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظپط§طھظٹط­
app.get('/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('product_keys')
      .select(`
        *,
        products (name, version)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, keys: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch keys" });
app.post("/admin/keys", authenticateAdmin, async (req, res) => {
  const { product_id, notes, count = 1 } = req.body;

  if (!product_id) {
    return res.status(400).json({ success: false, message: "Product ID is required" });
  }
  if (count < 1 || count > 100) { // Limit key generation count
    return res.status(400).json({ success: false, message: "Key count must be between 1 and 100" });
  }

  try {
    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ ط§ظ„ظ…ظ†طھط¬
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("name")
      .eq("id", product_id)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const generateKey = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let result = "";
      for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };

    const keys = [];
    for (let i = 0; i < count; i++) {
      const key = `${generateKey()}-${generateKey()}-${generateKey()}`;
      keys.push({
        key_value: key,
        product_id: product_id,
        is_used: false,
        created_by: req.user.email,
        notes: notes || `ظ…ظپطھط§ط­ ظ„ظ€ ${product.name} - طھظ… ط¥ظ†ط´ط§ط¤ظ‡ ط¨ظˆط§ط³ط·ط© ${req.user.email}`
      });
    }

    const { data, error } = await supabase
      .from("product_keys")
      .insert(keys)
      .select("id, key_value, product_id"); // Select specific fields to return

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: `Generated ${data.length} key(s) successfully!`,
      keys: data // Data already contains limited info due to .select()
    });

  } catch (err) {
    console.error("Generate keys error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to generate keys", details: err.message });
  }
});

// ًں“ٹ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظپط§طھظٹط­
app.get("/admin/keys", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("product_keys")
      .select(`
        id, key_value, is_used, created_at, created_by,
        products (name, version)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.status(200).json({ success: true, keys: data });
  } catch (err) {
    console.error("Fetch keys error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch keys", details: err.message });
  }
});

// â‌Œ ط­ط°ظپ ظ…ظپطھط§ط­ (ط؛ظٹط± ظ…ط³طھط®ط¯ظ… ظپظ‚ط·)
app.delete("/admin/keys/:key_value", authenticateAdmin, async (req, res) => {
  const { key_value } = req.params;

  try {
    const { data, error } = await supabase
      .from("product_keys")
      .select("is_used")
      .eq("key_value", key_value)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: "Key not found" });

    if (data.is_used) {
      return res.status(400).json({ success: false, message: "Cannot delete used key" });
    }

    const { error: delError } = await supabase
      .from("product_keys")
      .delete()
      .eq("key_value", key_value);

    if (delError) throw delError;

    res.status(200).json({ success: true, message: "Key deleted successfully!" });

  } catch (err) {
    console.error("Delete key error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to delete key", details: err.message });
  }
});

// â‍• ط¥ط¶ط§ظپط© ظ…ظ†طھط¬ ط¬ط¯ظٹط¯
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

// ًں“¦ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظ†طھط¬ط§طھ (ظ„ظ„ظ…ط´ط±ظپظٹظ†)
app.get('/admin/products', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, products: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
});

// âœڈï¸ڈ طھط­ط¯ظٹط« ظ…ظ†طھط¬
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

// ًں“ˆ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¥ط­طµط§ط¦ظٹط§طھ ط§ظ„طھظپط¹ظٹظ„
app.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    // ط¹ط¯ط¯ ط§ظ„طھظپط¹ظٹظ„ط§طھ ط§ظ„ظ†ط´ط·ط©
    const { data: activations, error: activationsError } = await supabase
      .from('activations')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (activationsError) throw activationsError;

    // ط¹ط¯ط¯ ط§ظ„ظ…ظپط§طھظٹط­ ط§ظ„ظ…ط³طھط®ط¯ظ…ط© ظˆط؛ظٹط± ط§ظ„ظ…ط³طھط®ط¯ظ…ط©
    const { data: keys, error: keysError } = await supabase
      .from('product_keys')
      .select('is_used', { count: 'exact' });

    if (keysError) throw keysError;

    const usedKeys = keys.filter(k => k.is_used).length;
    const unusedKeys = keys.length - usedKeys;

    // ط¹ط¯ط¯ ط§ظ„ظ…ظ†طھط¬ط§طھ
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (productsError) throw productsError;

    // ط¹ط¯ط¯ ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*', { count: 'exact' });

    if (usersError) throw usersError;

    res.json({
      success: true,
      stats: {
        total_activations: activations.length,
        used_keys: usedKeys,
        unused_keys: unusedKeys,
        total_products: products.length,
        total_users: users.length
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch statistics" });
  }
});

// ًں“‹ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط³ط¬ظ„ ط§ظ„طھظپط¹ظٹظ„ط§طھ
app.get('/admin/activations', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activations')
      .select(`
        *,
        product_keys (key_value),
        products (name, version),
        users (email, device_id)
      `)
      .order('activated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json({ success: true, activations: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch activations" });
  }
});

// ًںڑ€ طھط´ط؛ظٹظ„ ط§ظ„ط®ط§ط¯ظ…
app.listen(PORT, () => {
  console.log(`ًںڑ€ Activation API running on http://localhost:${PORT}`);
});

// ط¥ظ†ط´ط§ط، ظ…ط´ط±ظپ ط§ظپطھط±ط§ط¶ظٹ ط¥ط°ط§ ظ„ظ… ظٹظƒظ† ظ…ظˆط¬ظˆط¯ظ‹ط§
async function createDefaultAdmin() {
  try {
    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ
    const { data: existingAdmin, error: checkError } = await supabase
      .from('admins')
      .select('*')
      .eq('email', 'admin@example.com')
      .single();

    if (checkError || !existingAdmin) {
      // ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط§ظپطھط±ط§ط¶ظٹط©
      const defaultPassword = 'admin123';
      
      // طھط´ظپظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);
      
      // ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ
      const { data: newAdmin, error: createError } = await supabase
        .from('admins')
        .insert([
          {
            email: 'admin@example.com',
            password_hash: passwordHash,
            name: 'ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط±ط¦ظٹط³ظٹ',
            is_super_admin: true
          }
        ])
        .select();
      
      if (createError) {
        console.error('ظپط´ظ„ ظپظٹ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ:', createError.message);
      } else {
        console.log('طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ط¨ظ†ط¬ط§ط­');
        console.log('ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ: admin@example.com');
        console.log('ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±: admin123');
        console.log('ظٹط¬ط¨ طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط¨ط¹ط¯ ط£ظˆظ„ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„!');
      }
    } else {
      console.log('ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ…ظˆط¬ظˆط¯ ط¨ط§ظ„ظپط¹ظ„');
    }
  } catch (error) {
    console.error('ط®ط·ط£ ظپظٹ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ:', error);
  }
}

// ط§ط³طھط¯ط¹ط§ط، ط§ظ„ط¯ط§ظ„ط© ط¹ظ†ط¯ ط¨ط¯ط، ط§ظ„طھط´ط؛ظٹظ„
createDefaultAdmin();
