const express = require('express');
const axios = require('axios');
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
  
  // Return immediate 200 OK response to Mailgun
  res.status(200).json({ message: 'Webhook received successfully' });
  
  // Forward to scheduler-core asynchronously (don't block the response)
  setImmediate(async () => {
    try {
      // Extract and transform email data for scheduler-core
      const emailData = {
        subject: req.body.subject,
        from: req.body.from,
        to: req.body.to,
        "body-plain": req.body["body-plain"]
      };
      
      console.log('=== Forwarding to Scheduler-Core ===');
      console.log('Email Data:', JSON.stringify(emailData, null, 2));
      
      // Forward to scheduler-core service
      const response = await axios.post('https://job-pilot-theeenate.replit.app/api/job-intake', emailData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });
      
      console.log('=== Scheduler-Core Response ===');
      console.log('Status:', response.status);
      console.log('Data:', JSON.stringify(response.data, null, 2));
      console.log('==================================');
      
    } catch (error) {
      console.error('=== Error Forwarding to Scheduler-Core ===');
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Response Status:', error.response.status);
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      console.error('=========================================');
    }
  });
});

// Health check endpoint - responds immediately for deployment health checks
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    message: 'Mailgun Webhook Server is running',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log(`Mailgun webhook endpoint: POST /api/email-handler`);
});