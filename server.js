'use strict';

const createApp = require('./src/app');
const { config } = require('./src/config/env');
const { ML_ENABLED } = require('./src/services/aiService');

const app = createApp();

app.listen(config.port, () => {
  console.log(`BharatShield AI backend running on port ${config.port} [${config.nodeEnv}]`);
  console.log(`Mode: ${ML_ENABLED ? 'ML-trained' : 'rule-based fallback'}`);
});
