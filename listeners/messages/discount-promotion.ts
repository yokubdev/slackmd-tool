import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { analyzeDiscountRequest, createPromotionCodeBlock } from '../../utils/openai-analyzer';

const discountPromotionCallback = async ({
  event,
  say,
  logger,
  client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {

  try {
    // Only process regular messages (not message_changed, etc.)
    if (event.type !== 'message') { 
      return;
    }
    
    // Type guard to ensure we have a regular message event
    if ('subtype' in event && event.subtype) {
      // Skip non-regular messages
      return;
    }
    
    // Now we can safely access text property
    const messageEvent = event as any;
    const messageText = messageEvent.text || '';
    
    // Use OpenAI to analyze the message
    const analysis = await analyzeDiscountRequest(messageText);
    
    if (analysis.answer === 'yes') {
      // If we have promotion data, create markdown table and send it
      if (analysis.promotionData) {
        try {
          logger.info('Creating promotion table for:', analysis.promotionData.title);
          
          // Create markdown table in code block format
          const promotionTable = createPromotionCodeBlock(analysis.promotionData);
          
          // Send the promotion table as a code block
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts, // Reply in thread
            text: 'Here is the promotion data. Please review and confirm if correct:',
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "Here is the promotion data. Please review and confirm if correct:"
                }
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: promotionTable
                }
              }
            ]
          });
          
          logger.info('Promotion table sent successfully');
          
        } catch (error) {
          logger.error('Error sending promotion table:', error);
          
          // Fallback to simple text message
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: 'Yes, I can help with that promotion request.'
          });
        }
      } else {
        // Simple response if no promotion data
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: 'Yes of course'
        });
      }
    }
  } catch (error) {
    logger.error('Error in discount promotion callback:', error);
  }
};

export default discountPromotionCallback; 