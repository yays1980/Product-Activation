const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // ✅ تم إضافته هنا
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : undefined
}));
app.use(express.json());

// إعداد Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey1234567890';

// 🟢 نقطة فحص الحالة
app.get('/health', (req, res) => {
  res.json({ status: "OK", message: "Subscription API running!" });
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

// 💳 إنشاء جلسة دفع (Checkout Session)
app.post('/create-checkout-session', async (req, res) => {
  const { user_id, product_name } = req.body;

  if (!user_id || !product_name) {
    return res.status(400).json({ success: false, message: "user_id and product_name required" });
  }

  try {
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('name', product_name)
      .single();

    if (productError || !productData) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user_id)
      .single();

    let customer_id = userData?.stripe_customer_id;

    if (!customer_id) {
      const customer = await stripe.customers.create({
        email: userData?.email || undefined,
        metadata: { user_id } // ✅ صيغة صحيحة
      });
      customer_id = customer.id;

      await supabase
        .from('users')
        .update({ stripe_customer_id: customer_id })
        .eq('id', user_id);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: productData.stripe_product_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer: customer_id,
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      metadata: { user_id } // ✅ صيغة صحيحة
    });

    res.json({ sessionId: session.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to create checkout session" });
  }
});

// 🔁 تفعيل المنتج (بعد التحقق من الاشتراك النشط)
app.post('/activate', async (req, res) => {
  const { device_id, product_name } = req.body;

  if (!device_id || !product_name) {
    return res.status(400).json({ success: false, message: "device_id and product_name are required" });
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, stripe_customer_id')
      .eq('device_id', device_id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ success: false, message: "User not registered" });
    }

    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .gte('current_period_end', new Date().toISOString())
      .single();

    if (subError || !subData) {
      return res.status(403).json({
        success: false,
        message: "No active subscription found. Please purchase a plan.",
        needsPayment: true
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', subData.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: "Product activated successfully with active subscription!",
      product: product_name,
      expires_at: subData.current_period_end
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Activation failed" });
  }
});

// 🛑 إلغاء الاشتراك
app.post('/cancel-subscription', async (req, res) => {
  const { device_id } = req.body;

  if (!device_id) {
    return res.status(400).json({ success: false, message: "device_id required" });
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('device_id', device_id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .single();

    if (subError || !subData) {
      return res.status(404).json({ success: false, message: "No active subscription to cancel" });
    }

    await stripe.subscriptions.del(subData.stripe_subscription_id);

    await supabase
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subData.stripe_subscription_id);

    res.json({ success: true, message: "Subscription canceled successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to cancel subscription" });
  }
});

// 🔄 webhook من Stripe (تحديث حالة الاشتراك عند التجديد أو الإلغاء)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const userId = session.metadata.user_id;
      const subscriptionId = session.subscription;

      // ✅ استرجاع بيانات الاشتراك بدقة من Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const price = await stripe.prices.retrieve(subscription.items.data[0].price.id);
      const product = await stripe.products.retrieve(price.product);

      await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          stripe_subscription_id: subscriptionId,
          status: 'active',
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
          product_name: product.name // ✅ ديناميكي من Stripe
        });

      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      const subId = invoice.subscription;

      await supabase
        .from('payments')
        .insert({
          subscription_id: subId,
          stripe_payment_id: invoice.id,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          status: 'succeeded',
          occurred_at: new Date(invoice.created * 1000)
        });

      break;

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const sub = event.data.object;
      const status = sub.status;
      const stripeSubId = sub.id;

      await supabase
        .from('subscriptions')
        .update({ status, updated_at: new Date() })
        .eq('stripe_subscription_id', stripeSubId);

      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// 📊 عرض اشتراكات المستخدم
app.get('/subscriptions', async (req, res) => {
  const { device_id } = req.query;

  if (!device_id) {
    return res.status(400).json({ success: false, message: "device_id required" });
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('device_id', device_id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { data: subs, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });

    if (subError) throw subError;

    res.json({ success: true, subscriptions: subs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🔐 تسجيل دخول المشرف (باستخدام bcrypt و is_admin)
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
      return res.status(401).json({ success: false, message: "Invalid credentials" });
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
  console.log(`🚀 Subscription API running on http://localhost:${PORT}`);
});
