require('dotenv').config();
const { analyzeDiscountRequest } = require('./dist/utils/anthropic-analyzer');

async function testAnthropicIntegration() {
  console.log('Testing Anthropic API integration...');
  
  const testMessage = "Can you make a promotion for Memory Foam Mattress - 25% Off, valid until January 31, 2024?";
  
  try {
    const result = await analyzeDiscountRequest(testMessage);
    console.log('Analysis result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error testing Anthropic integration:', error);
  }
}

testAnthropicIntegration(); 