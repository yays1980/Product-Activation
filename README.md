# 🧾 Product Activation API (Node.js + Supabase)

## 💡 الوصف
نظام تفعيل منتجات بسيط وآمن باستخدام Node.js وقاعدة بيانات Supabase المجانية.

لا يستخدم Python — يعمل على Render.com مجانًا.

## 🛠️ المتطلبات
- Node.js مثبت على جهازك (للاختبار المحلي)
- حساب مجاني على [Supabase](https://supabase.com)

## 📂 الملفات
- `package.json` — يحتوي على التبعيات
- `app.js` — الخادم الأساسي مع دعم Supabase
- `README.md` — هذا الملف

## 🚀 كيفية التشغيل

### 1. عيّن متغيرات Supabase
افتح `app.js` وغيّر هذين السطرين:

```js
const supabaseUrl = 'https://vuhpparcgkmagpdsgups.supabase.co';

const supabaseKey = ';
