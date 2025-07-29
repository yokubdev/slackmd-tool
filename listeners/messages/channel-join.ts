import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';

const channelJoinCallback = async ({
  event,
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  try {
    // Only process channel_join events
    if (event.type !== 'message' || event.subtype !== 'channel_join') {
      return;
    }
    
    // Type guard to ensure we have a channel join event
    const joinEvent = event as any;
    
    // Check if this is the bot joining (bot user ID will be in the event)
    if (joinEvent.user) {
      // Respond with a greeting when the bot joins a channel
      await say('Hello everyone! 👋 I\'m here and ready to help! Just mention me to get started.');
    }
  } catch (error) {
    logger.error('Error in channel join callback:', error);
  }
};

export default channelJoinCallback; 