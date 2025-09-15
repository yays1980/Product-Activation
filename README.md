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
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1aHBwYXJjZ2ttYWdwZHNndXBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDA4ODQsImV4cCI6MjA3MzM3Njg4NH0.NyY5uhTpkJFYDlTI4I2jnz3ZM9z7QEkgw1dYz9dFxe8';