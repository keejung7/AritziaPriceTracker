import type { AvailabilityStatus } from '../../services/catalogTypes';

export default function AvailableSizes({ sizes, status }: { sizes: string[]; status: AvailabilityStatus }) {
  if (status === 'sold_out') return <p className="catalog-muted">Currently unavailable</p>;
  if (status === 'unknown') return <p className="catalog-muted">Availability unavailable</p>;
  return <div aria-label="Available sizes" className="catalog-sizes"><span className="catalog-muted">Available sizes</span>{sizes.map(size => <span key={size}>{size}</span>)}</div>;
}
