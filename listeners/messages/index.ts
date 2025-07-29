import type { App } from '@slack/bolt';
import channelJoinCallback from './channel-join';
import discountPromotionCallback from './discount-promotion';

const register = (app: App) => {
  app.message(channelJoinCallback);
  app.message(discountPromotionCallback);
};

export default { register };
