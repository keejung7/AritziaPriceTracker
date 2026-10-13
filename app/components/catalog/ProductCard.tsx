'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CatalogProduct } from '../../services/catalogTypes';
import ColorSwatches from './ColorSwatches';
import AvailableSizes from './AvailableSizes';

const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' }).format(value);

function Price({ price, original, percent }: { price: number | null; original: number | null; percent: number | null }) {
  if (price === null) return <>Price unavailable</>;
  const discounted = original !== null && original > price;
  return <><span>{money(price)}</span>{discounted && <><del>{money(original)}</del>{percent !== null && percent > 0 && <span className="catalog-discount">{percent}% off</span>}</>}</>;
}

export default function ProductCard({ product }: { product: CatalogProduct }) {
  const [selectedId, setSelectedId] = useState(product.selectedColorId);
  const selected = product.colors.find(color => color.colorId === selectedId) || product.colors[0];
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const name = product.productName || `Product ${product.productNo}`;
  const colorName = selected?.colorName || selected?.colorId;
  const image = selected?.productColorImageUrl;
  return <article className="catalog-card">
    <div className="catalog-image">
      {image && failedImage !== image ? <img src={image} alt={`${name} in ${colorName}`} loading="lazy" width={600} height={800} onError={() => setFailedImage(image)} /> : <span className="catalog-muted">Image unavailable</span>}
    </div>
    {product.productBrand && <p className="catalog-brand">{product.productBrand}</p>}
    <h2 className="catalog-product-name"><Link href={`/products/${product.productNo}`}>{name}</Link></h2>
    <div className="catalog-price" aria-label="Product starting price" style={{ fontVariantNumeric: 'tabular-nums' }}>From <Price price={product.fromPrice} original={product.fromOriginalPrice} percent={product.fromSalePercent} /></div>
    {product.insightLabel && <p className="catalog-insight">{product.insightLabel}</p>}
    {selected && <>
      <p className="catalog-selected-color">{colorName}</p>
      {(selected.effectivePrice !== product.fromPrice || selected.originalPrice !== product.fromOriginalPrice || selected.salePercent !== product.fromSalePercent) && <div className="catalog-price catalog-color-price" aria-label="Selected color price"><Price price={selected.effectivePrice} original={selected.originalPrice} percent={selected.salePercent} /></div>}
      <ColorSwatches colors={product.colors} selectedId={selected.colorId} onSelect={setSelectedId} />
    </>}
    <AvailableSizes sizes={selected?.availableSizes || []} status={selected?.availabilityStatus || product.availabilityStatus} />
  </article>;
}
