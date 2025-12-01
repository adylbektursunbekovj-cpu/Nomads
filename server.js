// server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const webpush = require('web-push');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------- MySQL -----------------
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Ares_8917',
  database: 'nomads'
});

db.getConnection((err, connection) => {
  if(err) console.error("Ошибка подключения к MySQL:", err);
  else { console.log("MySQL база подключена"); connection.release(); }
});

// ----------------- Web Push -----------------
webpush.setVapidDetails(
  'mailto:you@example.com',
  'BLNWC1BO0kdUZHjXyLQPLFhYS28BA9HeDue8WPtSyu1oMiiDBE1QnZTjDCyBD2Y5A-PZte6qZ8EmcVNUiuWpjGU',
  'RtVSOHG1kTUURFT8mUUHjdT-s37jnLPsI37i_RDmpug'
);

let subscriptions = []; // массив для хранения подписок (можно в базу)

// ----------------- Push подписка -----------------
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({});
});

// ----------------- API меню -----------------
app.get('/api/menu', (req, res) => {
  db.query("SELECT * FROM menu ORDER BY id DESC", (err, results) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/menu', (req, res) => {
  const { name, description, price, img } = req.body;
  if(!name || !price) return res.status(400).json({error:'Имя и цена обязательны'});

  db.query("INSERT INTO menu (name, description, price, img) VALUES (?, ?, ?, ?)",
    [name, description||'', price, img||''],
    (err, results) => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ id: results.insertId });
    }
  );
});

app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, price, img } = req.body;

  db.query("UPDATE menu SET name=?, description=?, price=?, img=? WHERE id=?",
    [name, description, price, img, id],
    (err) => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/menu/:id', (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM menu WHERE id=?", [id], (err) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ----------------- API заказов -----------------
app.post('/api/orders', (req, res) => {
  const { organization, phone, address, items } = req.body;
  if(!organization || !phone || !address || !items) {
    return res.status(400).json({ error: "Неверные данные" });
  }

  const itemsStr = JSON.stringify(items);

  db.query(
    "INSERT INTO orders (organization, phone, address, items, status) VALUES (?, ?, ?, ?, 'pending')",
    [organization, phone, address, itemsStr],
    (err, results) => {
      if(err) return res.status(500).json({ error: err.message });

      // ----------------- Отправка push всем подписанным -----------------
      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, JSON.stringify({
          title: 'Новый заказ!',
          body: `Заказ №${results.insertId} от ${organization}`
        })).catch(e => console.error('Ошибка push:', e));
      });

      console.log('Новый заказ:', {organization, phone, address, items});
      res.json({ id: results.insertId });
    }
  );
});

// Получить все заказы
app.get('/api/orders', (req, res) => {
  db.query("SELECT * FROM orders ORDER BY id DESC", (err, results) => {
    if(err) return res.status(500).json({ error: err.message });
    results = results.map(r => ({ ...r, items: JSON.parse(r.items) }));
    res.json(results);
  });
});

// Обновить статус заказа
app.post('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, courier_id } = req.body;

  db.query(
    "UPDATE orders SET status=?, courier_id=? WHERE id=?",
    [status, courier_id || null, id],
    (err) => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ----------------- Запуск сервера -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
