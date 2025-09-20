const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Claude API
// The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229"
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const app = express();
const PORT = 5000;

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// AI-powered job request analysis
async function analyzeEmailWithAI(emailData) {
  try {
    const prompt = `Analyze this email to determine if it contains a job request for scheduling technicians/workers. 

Email Subject: ${emailData.subject}
Email From: ${emailData.from}
Email Body: ${emailData["body-plain"]}

Return JSON only:
{
  "isJobRequest": true/false,
  "confidence": 0-100,
  "extractedData": {
    "location": "extracted location or null",
    "date": "extracted date or null", 
    "time": "extracted time or null",
    "jobType": "extracted job type or null",
    "techsNeeded": "number or null"
  },
  "reasoning": "brief explanation"
}`;

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a job scheduling assistant that analyzes emails to identify genuine job requests. Be precise and only classify clear job requests with high confidence.'
    });

    // Extract JSON from response (handle markdown code blocks)
    let responseText = response.content[0].text;
    
    // Remove markdown code block formatting if present
    const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }
    
    const analysisResult = JSON.parse(responseText.trim());
    
    // Log the analysis decision
    console.log('🤖 AI Analysis Result:');
    console.log(`   Job Request: ${analysisResult.isJobRequest}`);
    console.log(`   Confidence: ${analysisResult.confidence}%`);
    console.log(`   Reasoning: ${analysisResult.reasoning}`);
    if (analysisResult.extractedData) {
      console.log('   Extracted Data:', JSON.stringify(analysisResult.extractedData, null, 2));
    }
    
    return analysisResult;
  } catch (error) {
    console.error('❌ AI Analysis Error:', error.message);
    // Default to filtering if AI analysis fails (fail-safe)
    return {
      isJobRequest: true,
      confidence: 50,
      reasoning: 'AI analysis failed, defaulting to filter for safety (confidence below threshold)',
      extractedData: {}
    };
  }
}

// Universal email data extractor
function extractEmailData(body) {
  // Try multiple possible field names for subject
  const subject = body.subject || body.Subject || body['Subject'] || '';
  
  // Try multiple possible field names for sender
  const from = body.sender || body.from || body.From || body['From'] || 
               body.sender_email || body.email || '';
  
  // Try multiple possible field names for recipient  
  const to = body.recipient || body.to || body.To || body['To'] || 
             body.recipient_email || body.delivered_to || '';
  
  // Try multiple possible field names for email body text
  const bodyText = body['body-plain'] || body['stripped-text'] || body.text || 
                   body.body || body.content || body.message || '';
  
  return {
    subject,
    from, 
    to,
    "body-plain": bodyText
  };
}

// Universal Email Webhook Adapter
app.post('/api/email-handler', (req, res) => {
  console.log('=== Raw Webhook Received ===');
  console.log('Available fields:', Object.keys(req.body));
  console.log('Sample data:', JSON.stringify(req.body, null, 2));
  
  // Extract and normalize the email data
  const emailData = extractEmailData(req.body);
  
  console.log('=== Normalized Email Data ===');
  console.log(JSON.stringify(emailData, null, 2));
  
  // Always respond successfully to webhook
  res.status(200).json({ message: 'Webhook received successfully' });
  
  // Intelligent email processing with AI analysis
  setImmediate(async () => {
    try {
      // Only process if we extracted meaningful data
      if (!emailData.subject && !emailData.from && !emailData["body-plain"]) {
        console.log('⚠️  No meaningful email data found to analyze');
        return;
      }
      
      console.log('🤖 === AI Analysis Starting ===');
      
      // Analyze email with AI to determine if it's a job request
      const analysis = await analyzeEmailWithAI(emailData);
      
      // Decision logging for monitoring and improvement
      const decision = {
        timestamp: new Date().toISOString(),
        email: {
          from: emailData.from,
          subject: emailData.subject,
          bodyLength: emailData["body-plain"]?.length || 0
        },
        aiAnalysis: analysis,
        action: (analysis.isJobRequest && analysis.confidence > 70) ? 'FORWARDED' : 'FILTERED',
        forwardedToCore: false
      };
      
      // Only forward emails with high confidence job requests (>70%)
      if (analysis.isJobRequest && analysis.confidence > 70) {
        console.log('✅ High confidence job request detected - FORWARDING');
        console.log('=== Forwarding to Scheduler-Core ===');
        
        try {
          const response = await axios.post('https://job-pilot-theeenate.replit.app/api/job-intake', {
            ...emailData,
            aiAnalysis: analysis  // Include AI analysis in forwarded data
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          decision.forwardedToCore = true;
          decision.schedulerResponse = {
            status: response.status,
            data: response.data
          };
          
          console.log('✅ Forward successful:', response.status);
          console.log('Response:', JSON.stringify(response.data, null, 2));
          
        } catch (forwardError) {
          console.error('❌ Forward to scheduler-core failed:', forwardError.message);
          decision.forwardError = forwardError.message;
        }
        
      } else {
        console.log(`🚫 Email filtered out (${analysis.reasoning})`);
        console.log(`   Confidence: ${analysis.confidence}% (threshold: >70%)`);
      }
      
      // Log decision for monitoring and improvement
      console.log('📊 === Decision Log ===');
      console.log(JSON.stringify(decision, null, 2));
      console.log('======================');
      
    } catch (error) {
      console.error('❌ Email processing failed:', error.message);
      console.error('Stack:', error.stack);
    }
  });
});

// Health check endpoint - responds immediately for deployment health checks
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    message: 'AI-Powered Job Request Filter is running',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log(`AI-powered job request filter: POST /api/email-handler`);
});