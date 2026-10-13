'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogProduct, CatalogResponse, CatalogSort } from '../../services/catalogTypes';

export interface CatalogFiltersState {
  search: string;
  category: string;
  brand: string;
  color: string;
  sizes: string[];
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  minDiscount: string;
  sort: CatalogSort;
}

export const defaultCatalogFilters: CatalogFiltersState = {
  search: '', category: '', brand: '', color: '', sizes: [],
  minPrice: '', maxPrice: '', saleOnly: false, minDiscount: '', sort: 'discount-desc',
};

export function useCatalogProducts(filters: CatalogFiltersState) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<CatalogResponse['snapshot'] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = useRef({ loadMore: () => {}, retry: () => {} });
  const settledSearch = useRef(filters.search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '24', sort: filters.sort });
    for (const key of ['search', 'category', 'brand', 'color', 'minPrice', 'maxPrice'] as const) {
      const value = filters[key].trim();
      if (value) params.set(key, value);
    }
    for (const size of filters.sizes) params.append('size', size);
    if (filters.saleOnly) {
      params.set('saleOnly', 'true');
      if (filters.minDiscount !== '') params.set('minDiscount', filters.minDiscount);
    }
    return params.toString();
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let cursor: string | null = null;
    let hasLoaded = false;
    setProducts([]);
    setTotal(null);
    setSnapshot(null);
    setNextCursor(null);
    setError(null);
    setIsLoading(true);
    setIsLoadingMore(false);

    async function requestPage(requestedCursor: string | null) {
      if (pending || controller.signal.aborted) return;
      pending = true;
      setError(null);
      setIsLoading(requestedCursor === null);
      setIsLoadingMore(requestedCursor !== null);
      try {
        while (!controller.signal.aborted) {
          const params = new URLSearchParams(query);
          if (requestedCursor !== null) params.set('cursor', requestedCursor);
          const response = await fetch(`/api/catalog/products?${params}`, { signal: controller.signal });
          const body = await response.json();
          if (controller.signal.aborted) return;
          if (!response.ok) {
            if (requestedCursor !== null && body.error?.code === 'cursor_expired') {
              requestedCursor = null;
              cursor = null;
              hasLoaded = false;
              setProducts([]);
              setTotal(null);
              setSnapshot(null);
              setNextCursor(null);
              setIsLoading(true);
              setIsLoadingMore(false);
              continue;
            }
            throw new Error(body.error?.message || 'Unable to load products.');
          }
          const page = body as CatalogResponse;
          setProducts(current => {
            const unique = new Map<string, CatalogProduct>();
            for (const product of [...(requestedCursor === null ? [] : current), ...page.products]) {
              if (!unique.has(product.productNo)) unique.set(product.productNo, product);
            }
            return [...unique.values()];
          });
          cursor = page.nextCursor;
          hasLoaded = true;
          setNextCursor(cursor);
          setTotal(page.total);
          setSnapshot(page.snapshot);
          break;
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load products.');
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    }

    actions.current = {
      loadMore: () => { if (cursor !== null) void requestPage(cursor); },
      retry: () => { if (!hasLoaded || cursor !== null) void requestPage(hasLoaded ? cursor : null); },
    };
    const searchChanged = settledSearch.current !== filters.search;
    const timeout = searchChanged ? setTimeout(() => {
      settledSearch.current = filters.search;
      void requestPage(null);
    }, 300) : null;
    if (!searchChanged) void requestPage(null);
    return () => {
      if (timeout !== null) clearTimeout(timeout);
      controller.abort();
    };
  }, [query, filters.search]);

  const loadMore = useCallback(() => actions.current.loadMore(), []);
  const retry = useCallback(() => actions.current.retry(), []);
  return { products, total, snapshot, nextCursor, isLoading, isLoadingMore, error, loadMore, retry };
}
