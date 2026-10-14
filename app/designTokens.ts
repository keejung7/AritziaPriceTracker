// Pure shared values: importing these into a chart never loads Mantine or Highcharts.
export const editorialTokens = {
  canvas:'#F5F1EA', surface:'#FBF8F3', ink:'#2B2825', muted:'#756F68',
  separator:'#DDD5CB', accent:'#722F3D', accentWash:'#F0E2E5',
  fontFamily:'"Avenir Next", "Helvetica Neue", Arial, sans-serif',
} as const;
export const editorialCssVariables = {
  '--catalog-background':editorialTokens.canvas, '--catalog-surface':editorialTokens.surface,
  '--catalog-text':editorialTokens.ink, '--catalog-muted':editorialTokens.muted,
  '--catalog-border':editorialTokens.separator, '--catalog-accent':editorialTokens.accent,
  '--catalog-accent-soft':editorialTokens.accentWash, '--catalog-font-family':editorialTokens.fontFamily,
} as const;
