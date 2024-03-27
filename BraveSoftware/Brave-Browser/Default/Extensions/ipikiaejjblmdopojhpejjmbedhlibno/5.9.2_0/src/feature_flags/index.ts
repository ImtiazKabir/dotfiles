const featureRolloutPct: { [key: string]: number } = {
  'save-to-app': 0,
}

export const isFeatureEnabled = (featureId: string) => {
  const pct = featureRolloutPct[featureId]
  return Math.random() < pct
}
