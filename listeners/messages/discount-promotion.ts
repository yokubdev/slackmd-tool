import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { analyzeDiscountRequest, createPromotionCSV } from '../../utils/openai-analyzer';
import * as fs from 'fs';

const discountPromotionCallback = async ({
  event,
  logger,
  client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {

  try {
    if (event.type !== 'message') { 
      return;
    }
    
    if ('subtype' in event && event.subtype) {
      return;
    }
    
    const messageEvent = event as any;
    const messageText = messageEvent.text || '';
    
    logger.info('Received message:', messageText);
    
    const analysis = await analyzeDiscountRequest(messageText);
    
    logger.info('Analysis result:', analysis);
    
    if (analysis.answer === 'yes') {
      console.log('analysis.promotionData===', analysis.promotionData);
      if (analysis.promotionData) {
        let csvFilePath: string | undefined;
        try {
          logger.info('Creating promotion CSV for:', analysis.promotionData.title);
          
          csvFilePath = await createPromotionCSV(analysis.promotionData);
          logger.info('CSV file created at:', csvFilePath);
          
          // Upload the CSV file to Slack
          logger.info('Uploading CSV file to Slack...');
          const fileBuffer = fs.readFileSync(csvFilePath);
          
          // Extract date from promotion data or message
          const promotionDate = analysis.promotionData.date || 'Not specified';
          
          const uploadResult = await client.files.uploadV2({
            channel_id: event.channel,
            thread_ts: event.ts,
            file: fileBuffer,
            filename: `promotion_${analysis.promotionData.title.replace(/\s+/g, '_')}.csv`,
            title: `${analysis.promotionData.title} - Promotion Data`,
            initial_comment: `Here is the promotion, can you please confirm if correct?\nPromotion Date: ${promotionDate}`
          });
          
          logger.info('File upload result:', uploadResult);
          
          // Clean up the temporary file after upload
          fs.unlinkSync(csvFilePath);
          
          logger.info('Promotion CSV uploaded successfully');
          
        } catch (error) {
          logger.error('Error uploading promotion CSV:', error);
          
          try {
            if (csvFilePath && fs.existsSync(csvFilePath)) {
              fs.unlinkSync(csvFilePath);
            }
          } catch (cleanupError) {
            logger.error('Error cleaning up CSV file:', cleanupError);
          }
          
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: 'Yes, I can help with that promotion request. However, there was an issue creating the CSV file.'
          });
        }
      } else {
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