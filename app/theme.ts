import { createTheme } from '@mantine/core';
import { editorialTokens as tokens } from './designTokens';

export const theme = createTheme({
  fontFamily: tokens.fontFamily,
  headings: { fontFamily: tokens.fontFamily, fontWeight: '600' },
  primaryColor: 'oxblood',
  colors: { oxblood: [tokens.surface, tokens.accentWash, '#E5C9D0', '#D6ABB5', '#BE8290', '#A65D6E', '#8F4052', tokens.accent, '#622835', '#51212C'] },
  primaryShade: 7,
  defaultRadius: 'sm',
  black: tokens.ink,
  white: tokens.surface,
});
