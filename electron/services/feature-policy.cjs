const AI_FEATURE_POLICIES = {
  'video.analyze.audio': {
    buttonIds: ['analyze-audio'],
    pricing: { type: 'audio-duration', creditUnitsPerStartedMinute: 3, source: 'compressed-mp3' },
    label: '音频场景分析',
  },
  'video.analyze.vision': {
    buttonIds: ['analyze-vision'],
    pricing: { type: 'video-duration', creditUnitsPerStartedMinute: 30, source: 'compressed-video' },
    label: '视频场景分析',
  },
};

function getFeaturePolicy(actionId) {
  const policy = AI_FEATURE_POLICIES[actionId];
  return policy ? { actionId, ...policy } : null;
}

function isProtectedAction(actionId) {
  return Boolean(getFeaturePolicy(actionId));
}

module.exports = { AI_FEATURE_POLICIES, getFeaturePolicy, isProtectedAction };
