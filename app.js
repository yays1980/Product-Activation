const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('✅ الخادم يعمل!');
});

app.get('/health', (req, res) => {
  res.json({ status: "OK", message: "Working!" });
});

app.listen(PORT, () => {
  console.log(`🚀 يعمل على http://localhost:${PORT}`);
});
