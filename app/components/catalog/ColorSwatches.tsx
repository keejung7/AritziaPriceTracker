'use client';

import { useState } from 'react';
import type { CatalogColor } from '../../services/catalogTypes';

export default function ColorSwatches({ colors, selectedId, onSelect }: { colors: CatalogColor[]; selectedId: string | undefined; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = useState(() => colors.findIndex(color => color.colorId === selectedId) >= 5);
  const visible = expanded ? colors : colors.slice(0, 5);
  return <div className="catalog-swatches" role="group" aria-label="Choose a color">
    {visible.map(color => <button key={color.colorId} type="button" className="catalog-swatch" aria-label={`Select ${color.colorName || color.colorId}`} aria-pressed={color.colorId === selectedId} onClick={() => onSelect(color.colorId)}>
      {color.swatchImageUrl ? <img src={color.swatchImageUrl} alt="" width={24} height={24} loading="lazy" /> : <span aria-hidden="true">{(color.colorName || color.colorId).slice(0, 2)}</span>}
    </button>)}
    {colors.length > 5 && <button type="button" className="catalog-swatch-more" aria-expanded={expanded} aria-label={expanded ? 'Show fewer swatches' : `Show ${colors.length - 5} more swatches`} onClick={() => setExpanded(!expanded)}>{expanded ? '−' : `+${colors.length - 5}`}</button>}
  </div>;
}
