const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// ط¥ط¹ط¯ط§ط¯ Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("SUPABASE_URL and SUPABASE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ًں”‘ ط³ط± طھظˆظƒظ† JWT
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === 'your-secret-key-here') {
  console.error("JWT_SECRET must be set to a strong, unique value in .env");
  process.exit(1);
}

// ًںں¢ ظ†ظ‚ط·ط© ظپط­طµ ط§ظ„ط­ط§ظ„ط©
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Activation API running!" });
});

// ًں”گ طھط³ط¬ظٹظ„ ظ…ط³طھط®ط¯ظ… ط¬ط¯ظٹط¯ (ط¹ط¨ط± ط§ظ„ط¨ط±ظٹط¯ ط£ظˆ Device ID)
app.post("/register", async (req, res) => {
  const { email, device_id } = req.body;

  if (!email && !device_id) {
    return res.status(400).json({ success: false, message: "Either email or device_id is required" });
  }

  try {
    let existingUser = null;

    // ط§ظ„ط¨ط­ط« ط¨ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط¥ط°ط§ ظˆط¬ط¯
    if (email) {
      const { data: userData, error: emailError } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle(); // Use maybeSingle to handle no results gracefully
      if (emailError) throw emailError;
      existingUser = userData;
    }

    // ط§ظ„ط¨ط­ط« ط¨ظ…ط¹ط±ظپ ط§ظ„ط¬ظ‡ط§ط² ط¥ط°ط§ ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ط¨ط±ظٹط¯
    if (device_id && !existingUser) {
      const { data: userData, error: deviceIdError } = await supabase
        .from("users")
        .select("*")
        .eq("device_id", device_id)
        .maybeSingle(); // Use maybeSingle to handle no results gracefully
      if (deviceIdError) throw deviceIdError;
      existingUser = userData;
    }

    if (existingUser) {
      return res.status(200).json({
        success: true,
        message: "User already registered",
        user_id: existingUser.id,
        user: { email: existingUser.email, device_id: existingUser.device_id } // Return some user info
      });
    }

    const { data, error } = await supabase
      .from("users")
      .insert([{ email, device_id }])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "User registered successfully!",
      user_id: data[0].id,
      user: { email: data[0].email, device_id: data[0].device_id }
    });

  } catch (err) {
    console.error("Registration error:", err.message || err);
    res.status(500).json({ success: false, message: "Server error during registration", details: err.message });
  }
});

// ًں”چ ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ظ„ط§ط³ظ…
async function findProductByName(productName) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("name", productName)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Error finding product by name:", error.message);
    return null;
  }

  return data;
}

// ًں”چ ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ظ„ظ…ط¹ط±ظپ
async function findProductById(productId) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("Error finding product by ID:", error.message);
    return null;
  }

  return data;
}

// ًں”پ طھظپط¹ظٹظ„ ط§ظ„ظ…ظ†طھط¬
app.post("/activate", async (req, res) => {
  const { product_key, device_id, product_name, product_id } = req.body;

  if (!product_key || !device_id || (!product_name && !product_id)) {
    return res.status(400).json({ success: false, message: "product_key, device_id, and product_name or product_id are required" });
  }

  try {
    let product;

    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ظ†طھط¬ ط¨ط§ط³طھط®ط¯ط§ظ… ط§ظ„ظ…ط¹ط±ظپ ط£ظˆ ط§ظ„ط§ط³ظ…
    if (product_id) {
      product = await findProductById(product_id);
    } else if (product_name) {
      product = await findProductByName(product_name);
    } else {
      return res.status(400).json({ success: false, message: "Either product_name or product_id is required" });
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or is inactive" });
    }

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµط­ط© ظ…ظپطھط§ط­ ط§ظ„طھظپط¹ظٹظ„
    const { data: keyData, error: keyError } = await supabase
      .from("product_keys")
      .select("*")
      .eq("key_value", product_key)
      .eq("is_used", false)
      .eq("product_id", product.id)
      .maybeSingle();

    if (keyError) throw keyError;
    if (!keyData) {
      return res.status(404).json({ success: false, message: "Invalid, used, or incorrect product key for this product" });
    }

    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ظ…ط±طھط¨ط· ط¨ط§ظ„ط¬ظ‡ط§ط²
    let userId;
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("device_id", device_id)
      .maybeSingle();

    if (userError) throw userError;

    if (userData) {
      userId = userData.id;
    } else {
      // ط¥ط°ط§ ظ„ظ… ظٹظƒظ† ط§ظ„ظ…ط³طھط®ط¯ظ… ظ…ط³ط¬ظ„ط§ظ‹طŒ ظ†ظ†ط´ط¦ ظ…ط³طھط®ط¯ظ…ظ‹ط§ ط¬ط¯ظٹط¯ظ‹ط§
      const { data: newUser, error: newUserError } = await supabase
        .from("users")
        .insert([{ device_id }])
        .select()
        .single();

      if (newUserError) throw newUserError;
      userId = newUser.id;
    }

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظˆط¬ظˆط¯ طھظپط¹ظٹظ„ ط³ط§ط¨ظ‚ ظ„ظ‡ط°ط§ ط§ظ„ظ…ظ†طھط¬ ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ط¬ظ‡ط§ط²
    const { data: existingActivation, error: activationCheckError } = await supabase
      .from("activations")
      .select("*")
      .eq("device_id", device_id)
      .eq("product_id", product.id)
      .eq("is_active", true)
      .maybeSingle();

    if (activationCheckError) throw activationCheckError;

    if (existingActivation) {
      return res.status(400).json({
        success: false,
        message: "Product already activated on this device",
        activation_id: existingActivation.id
      });
    }

    // ط¥ظ†ط´ط§ط، ط§ظ„طھظپط¹ظٹظ„ ط§ظ„ط¬ط¯ظٹط¯
    const { data: activation, error: activationInsertError } = await supabase
      .from("activations")
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
      .from("product_keys")
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq("id", keyData.id);

    if (keyUpdateError) throw keyUpdateError;

    res.status(201).json({
      success: true,
      message: "Product activated successfully!",
      activation_id: activation.id,
      product: product.name,
      version: product.version,
      device_id,
      activated_at: activation.activated_at
    });

  } catch (err) {
    console.error("Activation error:", err.message || err);
    res.status(500).json({ success: false, message: "Activation failed", details: err.message });
  }
});

// ًں”ژ ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط­ط§ظ„ط© ط§ظ„طھظپط¹ظٹظ„
app.post("/verify", async (req, res) => {
  const { device_id, product_id } = req.body;

  if (!device_id || !product_id) {
    return res.status(400).json({ success: false, message: "device_id and product_id are required" });
  }

  try {
    // ط§ظ„ط¨ط­ط« ط¹ظ† ط§ظ„طھظپط¹ظٹظ„ ط§ظ„ظ†ط´ط·
    const { data: activation, error } = await supabase
      .from("activations")
      .select(`
        *,
        product_keys (key_value),
        products (name, version)
      `)
      .eq("device_id", device_id)
      .eq("product_id", product_id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (!activation) {
      return res.status(404).json({ success: false, message: "No active activation found for this device and product" });
    }

    // طھط­ط¯ظٹط« ظˆظ‚طھ ط¢ط®ط± طھط­ظ‚ظ‚
    const { error: updateError } = await supabase
      .from("activations")
      .update({ last_check: new Date().toISOString() })
      .eq("id", activation.id);

    if (updateError) console.warn("Failed to update last_check for activation:", updateError.message);

    res.status(200).json({
      success: true,
      message: "Activation is valid",
      activation: {
        product: activation.products?.name || "N/A",
        version: activation.products?.version || "N/A",
        device_id: activation.device_id,
        activated_at: activation.activated_at,
        key: activation.product_keys?.key_value || "N/A"
      }
    });

  } catch (err) {
    console.error("Verification error:", err.message || err);
    res.status(500).json({ success: false, message: "Verification failed", details: err.message });
  }
});

// ًں“¦ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظ†طھط¬ط§طھ (ظ„ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط§ظ„ط¹ط§ط¯ظٹظٹظ†)
app.get("/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, version, price, description") // Select specific fields for public view
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      products: data
    });
  } catch (err) {
    console.error("Fetch products error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch products", details: err.message });
  }
});

// ًں”گ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„ ط§ظ„ظ…ط´ط±ظپ
app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required" });
  }

  try {
    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    if (!admin) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({
      userId: admin.id,
      email: admin.email,
      role: "admin",
      isSuperAdmin: admin.is_super_admin
    }, JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({
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
    console.error("Admin login error:", err.message || err);
    res.status(500).json({ success: false, message: "Server error during login", details: err.message });
  }
});

// ًں›،ï¸ڈ طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط´ط±ظپ
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, message: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT verification error:", err.message);
      return res.status(403).json({ success: false, message: "Invalid or expired token", details: err.message });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    req.user = user;
    next();
  });
}

// â‍• ط¥ط¶ط§ظپط© ظ…ظپطھط§ط­ ط¬ط¯ظٹط¯
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
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: `Generated ${data.length} key(s) successfully!`,
      keys: data.map(k => ({ id: k.id, key_value: k.key_value, product_id: k.product_id })) // Return limited key info
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
app.post("/admin/products", authenticateAdmin, async (req, res) => {
  const { name, version, description, price, is_active = true } = req.body;

  if (!name || price === undefined) { // Price should be explicitly checked
    return res.status(400).json({ success: false, message: "Product name and price are required" });
  }
  if (typeof price !== 'number' || price < 0) {
    return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .insert([
        {
          name,
          version: version || "1.0",
          description,
          price,
          is_active
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "Product added successfully!",
      product: data
    });

  } catch (err) {
    console.error("Add product error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to add product", details: err.message });
  }
});

// ًں“¦ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ظ†طھط¬ط§طھ (ظ„ظ„ظ…ط´ط±ظپظٹظ†)
app.get("/admin/products", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    res.status(200).json({ success: true, products: data });
  } catch (err) {
    console.error("Fetch admin products error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch products", details: err.message });
  }
});

// âœڈï¸ڈ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ظ†طھط¬ ظˆط§ط­ط¯ (ظ„ظ„طھط¹ط¯ظٹظ„)
app.get("/admin/products/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: "Product not found" });

    res.status(200).json({ success: true, product: data });
  } catch (err) {
    console.error("Get single product error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch product", details: err.message });
  }
});

// âœڈï¸ڈ طھط­ط¯ظٹط« ظ…ظ†طھط¬
app.put("/admin/products/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, version, description, price, is_active } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ success: false, message: "Product name and price are required" });
  }
  if (typeof price !== 'number' || price < 0) {
    return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .update({
        name,
        version,
        description,
        price,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: "Product updated successfully!",
      product: data
    });

  } catch (err) {
    console.error("Update product error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to update product", details: err.message });
  }
});

// ًں”„ طھط¨ط¯ظٹظ„ ط­ط§ظ„ط© ط§ظ„ظ…ظ†طھط¬ (ظ†ط´ط·/ط؛ظٹط± ظ†ط´ط·)
app.put("/admin/products/:id/toggle-status", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ success: false, message: "is_active must be a boolean value" });
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, is_active")
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: "Product not found" });

    res.status(200).json({
      success: true,
      message: `Product status updated to ${data.is_active ? 'active' : 'inactive'}!`, 
      product: data
    });

  } catch (err) {
    console.error("Toggle product status error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to toggle product status", details: err.message });
  }
});

// ًں“ˆ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¥ط­طµط§ط¦ظٹط§طھ ط§ظ„طھظپط¹ظٹظ„
app.get("/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    // ط¹ط¯ط¯ ط§ظ„طھظپط¹ظٹظ„ط§طھ ط§ظ„ظ†ط´ط·ط©
    const { count: total_activations, error: activationsError } = await supabase
      .from("activations")
      .select("id", { count: "exact", head: true }); // Use head: true for count only

    if (activationsError) throw activationsError;

    // ط¹ط¯ط¯ ط§ظ„ظ…ظپط§طھظٹط­ ط§ظ„ظ…ط³طھط®ط¯ظ…ط© ظˆط؛ظٹط± ط§ظ„ظ…ط³طھط®ط¯ظ…ط©
    const { count: total_keys, error: totalKeysError } = await supabase
      .from("product_keys")
      .select("id", { count: "exact", head: true });

    if (totalKeysError) throw totalKeysError;

    const { count: used_keys, error: usedKeysError } = await supabase
      .from("product_keys")
      .select("id", { count: "exact", head: true })
      .eq("is_used", true);

    if (usedKeysError) throw usedKeysError;

    const unused_keys = total_keys - used_keys;

    // ط¹ط¯ط¯ ط§ظ„ظ…ظ†طھط¬ط§طھ ط§ظ„ظ†ط´ط·ط©
    const { count: total_products, error: productsError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (productsError) throw productsError;

    // ط¹ط¯ط¯ ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†
    const { count: total_users, error: usersError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true });

    if (usersError) throw usersError;

    res.status(200).json({
      success: true,
      stats: {
        total_activations: total_activations || 0,
        used_keys: used_keys || 0,
        unused_keys: unused_keys || 0,
        total_products: total_products || 0,
        total_users: total_users || 0
      }
    });

  } catch (err) {
    console.error("Fetch statistics error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch statistics", details: err.message });
  }
});

// ًں“‹ ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط³ط¬ظ„ ط§ظ„طھظپط¹ظٹظ„ط§طھ
app.get("/admin/activations", authenticateAdmin, async (req, res) => {
  const { limit = 100, offset = 0 } = req.query; // Add pagination
  try {
    const { data, error } = await supabase
      .from("activations")
      .select(`
        id, device_id, activated_at, is_active,
        product_keys (key_value),
        products (name, version),
        users (email, device_id)
      `)
      .order("activated_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1); // Apply range for pagination

    if (error) throw error;

    res.status(200).json({ success: true, activations: data });
  } catch (err) {
    console.error("Fetch activations error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to fetch activations", details: err.message });
  }
});

// ًں“ٹ طھظ‚ط§ط±ظٹط± ط§ظ„ظ…ط¨ظٹط¹ط§طھ ظˆط§ظ„طھظپط¹ظٹظ„ط§طھ
app.get("/admin/reports/summary", authenticateAdmin, async (req, res) => {
  const { product_id, start_date, end_date } = req.query;

  try {
    let query = supabase.from("activations").select(`
      id, activated_at, product_id,
      products (name, price)
    `);

    if (product_id) {
      query = query.eq("product_id", product_id);
    }
    if (start_date) {
      query = query.gte("activated_at", start_date);
    }
    if (end_date) {
      query = query.lte("activated_at", end_date);
    }

    const { data: activations, error: activationsError } = await query;
    if (activationsError) throw activationsError;

    let totalSales = 0;
    let totalActivations = activations.length;
    let productName = "ط¬ظ…ظٹط¹ ط§ظ„ظ…ظ†طھط¬ط§طھ";

    if (product_id) {
      const product = await findProductById(product_id);
      if (product) productName = product.name;
    }

    activations.forEach(act => {
      if (act.products && act.products.price) {
        totalSales += act.products.price;
      }
    });

    // Get unused keys for the product (or all if no product_id)
    let unusedKeysQuery = supabase.from("product_keys").select("id", { count: "exact", head: true }).eq("is_used", false);
    if (product_id) {
      unusedKeysQuery = unusedKeysQuery.eq("product_id", product_id);
    }
    const { count: unused_keys, error: unusedKeysError } = await unusedKeysQuery;
    if (unusedKeysError) throw unusedKeysError;

    res.status(200).json({
      success: true,
      report: {
        product_name: productName,
        total_sales: totalSales,
        total_activations: totalActivations,
        unused_keys: unused_keys || 0
      }
    });

  } catch (err) {
    console.error("Generate report error:", err.message || err);
    res.status(500).json({ success: false, message: "Failed to generate report", details: err.message });
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
      .from("admins")
      .select("*")
      .eq("email", "admin@example.com")
      .maybeSingle();

    if (checkError) throw checkError;

    if (!existingAdmin) {
      // ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط§ظپطھط±ط§ط¶ظٹط©
      const defaultPassword = "admin123";

      // طھط´ظپظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

      // ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ
      const { data: newAdmin, error: createError } = await supabase
        .from("admins")
        .insert([
          {
            email: "admin@example.com",
            password_hash: passwordHash,
            name: "ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط±ط¦ظٹط³ظٹ",
            is_super_admin: true
          }
        ])
        .select();

      if (createError) {
        console.error("ظپط´ظ„ ظپظٹ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ:", createError.message);
      } else {
        console.log("طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ط¨ظ†ط¬ط§ط­");
        console.log("ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ: admin@example.com");
        console.log("ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±: admin123");
        console.log("ظٹط¬ط¨ طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط¨ط¹ط¯ ط£ظˆظ„ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„!");
      }
    } else {
      console.log("ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ…ظˆط¬ظˆط¯ ط¨ط§ظ„ظپط¹ظ„");
    }
  } catch (error) {
    console.error("ط®ط·ط£ ظپظٹ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظپ ط§ظ„ط§ظپطھط±ط§ط¶ظٹ:", error.message || error);
  }
}

// ط§ط³طھط¯ط¹ط§ط، ط§ظ„ط¯ط§ظ„ط© ط¹ظ†ط¯ ط¨ط¯ط، ط§ظ„طھط´ط؛ظٹظ„
createDefaultAdmin();
