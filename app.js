const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// ⚙️ ⚠️ استبدل هذه القيم بقيمتك من Supabase Dashboard → Settings → API
const supabaseUrl = 'https://vuhpparcgkmagpdsgups.supabase.co'; // ← ضع رابط مشروعك هنا
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1aHBwYXJjZ2ttYWdwZHNndXBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDA4ODQsImV4cCI6MjA3MzM3Njg4NH0.NyY5uhTpkJFYDlTI4I2jnz3ZM9z7QEkgw1dYz9dFxe8'; // ← ضع Service Role Key هنا

const supabase = createClient(supabaseUrl, supabaseKey);

// تفعيل المنتج
app.post('/activate', async (req, res) => {
  const { product_key, user_email } = req.body;

  if (!product_key) {
    return res.status(400).json({ success: false, message: "product_key is required" });
  }

  if (!user_email) {
    return res.status(400).json({ success: false, message: "user_email is required" });
  }

  try {
    const { data, error } = await supabase
      .from('product_keys')
      .select('*')
      .eq('key_value', product_key)
      .single();

    if (error) {
      return res.status(404).json({ success: false, message: "Invalid product key" });
    }

    if (data.is_used) {
      return res.status(403).json({ success: false, message: "Product key already used" });
    }

    const { data: updateData, error: updateError } = await supabase
      .from('product_keys')
      .update({
        is_used: true,
        activated_by: user_email,
        updated_at: new Date().toISOString()
      })
      .eq('key_value', product_key)
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ success: false, message: "Failed to activate product" });
    }

    res.json({
      success: true,
      message: "Product activated successfully!",
      product: data.product_name,
      activated_for: user_email,
      key_id: data.id
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// توليد مفتاح جديد (للإدارة فقط)
app.get('/generate', async (req, res) => {
  const product_name = req.query.product || 'ProSuite';
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const key = `${generateKey()}-${generateKey()}-${generateKey()}`;

  const { data, error } = await supabase
    .from('product_keys')
    .insert({ key_value: key, product_name })
    .select();

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  res.json({
    success: true,
    product_key: key,
    product_name: product_name
  });
});

// فحص الحالة
app.get('/health', (req, res) => {
  res.json({
    status: "OK",
    message: "Connected to Supabase and running!"
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});