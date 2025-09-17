const express = require('express');
const app = express();
const PORT = 5000;

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Webhook endpoint for Mailgun
app.post('/api/email-handler', (req, res) => {
  console.log('=== Mailgun Webhook Received ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=====================================');
  
  // Return 200 OK status as required
  res.status(200).json({ message: 'Webhook received successfully' });
});

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Mailgun Webhook Server is running' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log(`Mailgun webhook endpoint: POST /api/email-handler`);
});