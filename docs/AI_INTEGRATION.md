# AI Integration Guide

This guide shows how to integrate AI capabilities into your realtime canvas application using Claude API or other AI services.

## AI Features to Implement

### 1. Smart Shape Recognition
Convert rough hand-drawn shapes into perfect geometric shapes

### 2. Natural Language Commands
Allow users to create shapes using text: "draw a blue circle in the center"

### 3. Intelligent Auto-Complete
Predict and suggest what the user is trying to draw

### 4. Session Summarization
Generate meeting notes and action items from collaborative sessions

### 5. Content-Aware Suggestions
Provide contextual suggestions based on what's already on the canvas

## Setup

### Install Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

Add to your `.env`:
```env
ANTHROPIC_API_KEY=your-api-key-here
```

## Implementation Examples

### 1. Smart Shape Recognition

Create `services/aiService.js`:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function recognizeShape(drawingData) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Analyze these drawing coordinates and identify if they form a recognizable shape (circle, square, triangle, line, etc.): ${JSON.stringify(drawingData.points)}. Return a JSON object with: { "shape": "circle|square|triangle|line|unknown", "confidence": 0-1, "suggestedPoints": [...] }`
    }]
  });

  return JSON.parse(message.content[0].text);
}

module.exports = { recognizeShape };
```

### 2. Natural Language to Drawing

```javascript
async function textToDrawing(text, canvasContext) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Convert this drawing instruction into canvas commands: "${text}". 
      Current canvas size: ${canvasContext.width}x${canvasContext.height}. 
      Existing shapes: ${JSON.stringify(canvasContext.shapes)}.
      Return JSON: { "shape": "circle|rectangle|line|text", "x": number, "y": number, "width": number, "height": number, "color": "hex", "text": "string if text" }`
    }]
  });

  return JSON.parse(message.content[0].text);
}
```

### 3. Intelligent Suggestions

```javascript
async function getSuggestions(canvasState) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Analyze this canvas and provide 3-5 helpful suggestions: ${JSON.stringify(canvasState)}. 
      Consider: layout improvements, missing elements, color harmony, typical patterns (flowcharts, diagrams, etc.).
      Return JSON array: [{ "type": "add|modify|organize", "suggestion": "text", "action": {} }]`
    }]
  });

  return JSON.parse(message.content[0].text);
}
```

### 4. Session Summarization

```javascript
async function summarizeSession(canvasHistory, chatMessages) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Summarize this collaborative canvas session:
      
      Canvas Activity: ${JSON.stringify(canvasHistory)}
      Chat Messages: ${JSON.stringify(chatMessages)}
      
      Provide:
      1. Brief summary of the session
      2. Key decisions made
      3. Action items (if any)
      4. Main topics discussed
      5. Created elements summary`
    }]
  });

  return message.content[0].text;
}
```

## Adding AI Routes

Add to `routes/ai.js`:

```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const aiService = require('../services/aiService');

// Text to drawing
router.post('/text-to-drawing', authenticateToken, async (req, res) => {
  try {
    const { text, canvasContext } = req.body;
    const drawing = await aiService.textToDrawing(text, canvasContext);
    res.json({ success: true, drawing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Shape recognition
router.post('/recognize-shape', authenticateToken, async (req, res) => {
  try {
    const { drawingData } = req.body;
    const result = await aiService.recognizeShape(drawingData);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get suggestions
router.post('/suggestions', authenticateToken, async (req, res) => {
  try {
    const { canvasState } = req.body;
    const suggestions = await aiService.getSuggestions(canvasState);
    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Summarize session
router.post('/summarize', authenticateToken, async (req, res) => {
  try {
    const { canvasId } = req.body;
    const canvasHistory = canvasManager.getCanvasState(canvasId);
    const chatHistory = canvasManager.getChatHistory(canvasId);
    
    const summary = await aiService.summarizeSession(canvasHistory, chatHistory);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

Add to `server.js`:

```javascript
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);
```

## Socket.IO AI Events

Add to your Socket.IO handlers in `server.js`:

```javascript
// AI shape recognition request
socket.on('ai:recognize-shape', async (data) => {
  try {
    const result = await aiService.recognizeShape(data);
    socket.emit('ai:shape-recognized', result);
  } catch (error) {
    socket.emit('ai:error', { message: error.message });
  }
});

// AI text to drawing
socket.on('ai:text-to-drawing', async (data) => {
  try {
    const drawing = await aiService.textToDrawing(data.text, data.context);
    socket.emit('ai:drawing-created', drawing);
  } catch (error) {
    socket.emit('ai:error', { message: error.message });
  }
});

// AI suggestions
socket.on('ai:get-suggestions', async () => {
  try {
    const canvasState = canvasManager.getCanvasState(socket.currentCanvas);
    const suggestions = await aiService.getSuggestions(canvasState);
    socket.emit('ai:suggestions', suggestions);
  } catch (error) {
    socket.emit('ai:error', { message: error.message });
  }
});
```

## Frontend Integration

Example frontend code to use AI features:

```javascript
// Shape recognition
canvas.addEventListener('mouseup', async (e) => {
  if (drawingPoints.length > 10) {
    socket.emit('ai:recognize-shape', {
      points: drawingPoints,
      timestamp: Date.now()
    });
  }
});

socket.on('ai:shape-recognized', (result) => {
  if (result.confidence > 0.7) {
    // Show suggestion to user
    showNotification(`Detected ${result.shape}. Clean it up?`);
    
    if (userAccepts) {
      // Replace rough drawing with perfect shape
      drawPerfectShape(result.shape, result.suggestedPoints);
    }
  }
});

// Text to drawing
const textInput = document.getElementById('ai-command');
textInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    socket.emit('ai:text-to-drawing', {
      text: e.target.value,
      context: {
        width: canvas.width,
        height: canvas.height,
        shapes: currentShapes
      }
    });
  }
});

socket.on('ai:drawing-created', (drawing) => {
  // Add the AI-generated shape to canvas
  addShape(drawing);
});

// Get suggestions
document.getElementById('ai-suggest-btn').addEventListener('click', () => {
  socket.emit('ai:get-suggestions');
});

socket.on('ai:suggestions', (suggestions) => {
  displaySuggestions(suggestions);
});
```

## Cost Optimization

### 1. Debounce AI Requests

```javascript
let recognitionTimeout;
function debouncedRecognition(data) {
  clearTimeout(recognitionTimeout);
  recognitionTimeout = setTimeout(() => {
    socket.emit('ai:recognize-shape', data);
  }, 500); // Wait 500ms after user stops drawing
}
```

### 2. Cache Common Requests

```javascript
const cache = new Map();

async function cachedAIRequest(key, fn) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await fn();
  cache.set(key, result);
  
  // Cache for 5 minutes
  setTimeout(() => cache.delete(key), 5 * 60 * 1000);
  
  return result;
}
```

### 3. Use Streaming for Long Responses

```javascript
async function streamSummary(canvasHistory) {
  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Summarize this session: ${JSON.stringify(canvasHistory)}`
    }]
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      socket.emit('ai:summary-chunk', chunk.delta.text);
    }
  }
}
```

## Advanced Features

### 1. Vision API for Image Analysis

```javascript
async function analyzeDrawing(imageBase64) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: "Analyze this drawing and suggest improvements"
        }
      ],
    }],
  });

  return message.content[0].text;
}
```

### 2. Collaborative AI Assistant

```javascript
// AI that watches the collaboration and offers help
setInterval(async () => {
  const activity = canvasManager.getRecentActivity(canvasId, 60000); // Last minute
  
  if (activity.length > 0) {
    const suggestion = await aiService.analyzeActivity(activity);
    if (suggestion.helpful) {
      io.to(canvasId).emit('ai:assistant-message', suggestion);
    }
  }
}, 30000); // Check every 30 seconds
```

### 3. Smart Undo/Redo

```javascript
async function intelligentUndo(canvasState) {
  // AI determines what "undo" means in context
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Given this canvas state, what should "undo" remove? ${JSON.stringify(canvasState)}`
    }]
  });

  return JSON.parse(message.content[0].text);
}
```

## Testing AI Features

Create `test-ai.js`:

```javascript
require('dotenv').config();
const aiService = require('./services/aiService');

async function testAI() {
  // Test shape recognition
  const shapeResult = await aiService.recognizeShape({
    points: [[10,10], [20,10], [20,20], [10,20], [10,10]]
  });
  console.log('Shape recognition:', shapeResult);

  // Test text to drawing
  const drawing = await aiService.textToDrawing(
    "draw a blue circle in the center",
    { width: 800, height: 600, shapes: [] }
  );
  console.log('Text to drawing:', drawing);
}

testAI();
```

Run:
```bash
node test-ai.js
```

## Best Practices

1. **Rate Limiting**: Limit AI requests per user/session
2. **Error Handling**: Always handle AI API failures gracefully
3. **User Feedback**: Show loading states for AI operations
4. **Privacy**: Be transparent about AI usage
5. **Fallbacks**: Provide manual alternatives if AI fails
6. **Cost Monitoring**: Track API usage and costs
7. **Caching**: Cache similar requests to reduce costs

## Environment Variables

Add to `.env`:

```env
# AI Configuration
ANTHROPIC_API_KEY=your-key-here
AI_ENABLED=true
AI_RATE_LIMIT=100  # requests per hour per user
AI_CACHE_TTL=300   # seconds
```

## Monitoring

Track AI usage:

```javascript
const aiMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0
};

// Log metrics periodically
setInterval(() => {
  console.log('AI Metrics:', aiMetrics);
}, 60000);
```

## Next Steps

1. Implement one AI feature at a time
2. Test thoroughly with real users
3. Monitor costs and performance
4. Gather user feedback
5. Iterate and improve

Your realtime canvas is now AI-powered! 🤖✨
