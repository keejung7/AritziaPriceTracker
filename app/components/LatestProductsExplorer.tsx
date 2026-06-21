"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  ColorSwatch,
  Group,
  Loader,
  NumberInput,
  Paper,
  Progress,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { PriceRow } from "../services/priceHistoryService";

const PRODUCT_LIMIT = 500;

type SaleFilter = "all" | "sale" | "full-price";

interface Metric {
  label: string;
  value: string;
  detail: string;
}

interface ProductGroup {
  productNo: number;
  productName: string | null;
  productBrand: string | null;
  productUrl: string;
  colors: PriceRow[];
  leadColor: PriceRow;
}

export default function LatestProductsExplorer() {
  const [products, setProducts] = useState<PriceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("all");
  const [brand, setBrand] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [minDiscount, setMinDiscount] = useState<number | string>(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/prices/latest?limit=${PRODUCT_LIMIT}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Latest products request failed with ${response.status}`);
        }

        const rows = (await response.json()) as PriceRow[];

        if (!controller.signal.aborted) {
          setProducts(rows);
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load latest products.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadProducts();

    return () => controller.abort();
  }, []);

  const brandOptions = useMemo(() => {
    return uniqueOptions(products.map((product) => product.productBrand));
  }, [products]);

  const colorOptions = useMemo(() => {
    return uniqueOptions(products.map((product) => product.colorName));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const discountFloor =
      typeof minDiscount === "number" ? minDiscount : Number(minDiscount) || 0;

    return products.filter((product) => {
      const hasSale = product.salePrice != null;
      const salePercent = getDiscountPercent(product.salePercent);
      const searchableText = [
        product.productNo,
        product.productName,
        product.productBrand,
        product.colorName,
        product.colorId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (normalizedSearch && !searchableText.includes(normalizedSearch)) {
        return false;
      }

      if (saleFilter === "sale" && !hasSale) {
        return false;
      }

      if (saleFilter === "full-price" && hasSale) {
        return false;
      }

      if (brand != null && product.productBrand !== brand) {
        return false;
      }

      if (color != null && product.colorName !== color) {
        return false;
      }

      return salePercent >= discountFloor;
    });
  }, [brand, color, minDiscount, products, saleFilter, search]);

  const productGroups = useMemo(() => groupProductsByBestDeal(filteredProducts), [
    filteredProducts,
  ]);

  const metrics = useMemo<Metric[]>(() => {
    if (isLoading) {
      return [
        {
          label: "Tracked rows",
          value: "Loading",
          detail: "Product/color snapshots",
        },
        {
          label: "On sale",
          value: "Loading",
          detail: "Latest rows",
        },
        {
          label: "Average sale",
          value: "Loading",
          detail: "Across discounted rows",
        },
        {
          label: "Freshest scrape",
          value: "Loading",
          detail: "Waiting for API data",
        },
      ];
    }

    const saleRows = products.filter((product) => product.salePrice != null);
    const discounts = saleRows
      .map((product) => getDiscountPercent(product.salePercent))
      .filter((value) => value > 0);
    const latestScrape = getLatestScrapeDate(products);
    const averageDiscount =
      discounts.length === 0
        ? "0%"
        : `${Math.round(discounts.reduce((sum, value) => sum + value, 0) / discounts.length)}%`;

    return [
      {
        label: "Tracked rows",
        value: products.length.toLocaleString(),
        detail: "Product/color snapshots",
      },
      {
        label: "On sale",
        value: saleRows.length.toLocaleString(),
        detail: `${getPercentage(saleRows.length, products.length)} of latest rows`,
      },
      {
        label: "Average sale",
        value: averageDiscount,
        detail: "Across discounted rows",
      },
      {
        label: "Freshest scrape",
        value: latestScrape == null ? "No data" : formatShortDate(latestScrape),
        detail: latestScrape == null ? "Waiting for API data" : formatLongDate(latestScrape),
      },
    ];
  }, [isLoading, products]);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="start" gap="xl">
        <Box>
          <Text size="sm" fw={800} c="red.7" tt="uppercase">
            Latest products
          </Text>
          <Title order={1}>Aritzia Price Tracker</Title>
          <Text c="dimmed" maw={760}>
            Browse current product and color prices as a sale board, with each card
            linking to its full price history.
          </Text>
        </Box>
        <Badge color="red" variant="light" size="lg">
          {isLoading ? "Loading" : `${productGroups.length.toLocaleString()} products`}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </SimpleGrid>

      <Paper withBorder radius="sm" p="sm" bg="#fbfaf8">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm" verticalSpacing="md">
          <TextInput
            label="Search"
            placeholder="Name, brand, color, product no."
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Select
            label="Brand"
            placeholder="All brands"
            data={brandOptions}
            value={brand}
            onChange={(value) => setBrand(value == null ? null : String(value))}
            clearable
            searchable
          />
          <Select
            label="Color"
            placeholder="All colors"
            data={colorOptions}
            value={color}
            onChange={(value) => setColor(value == null ? null : String(value))}
            clearable
            searchable
          />
          <NumberInput
            label="Minimum discount"
            min={0}
            max={100}
            suffix="%"
            value={minDiscount}
            onChange={(value) =>
              setMinDiscount(typeof value === "bigint" ? Number(value) : value)
            }
          />
          <Box>
            <Text size="sm" fw={500} mb={5}>
              Price state
            </Text>
            <SegmentedControl
              fullWidth
              value={saleFilter}
              onChange={(value) => setSaleFilter(value as SaleFilter)}
              data={[
                { label: "All", value: "all" },
                { label: "Sale", value: "sale" },
                { label: "Full", value: "full-price" },
              ]}
            />
          </Box>
        </SimpleGrid>

        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            {isLoading
              ? "Loading latest product rows"
              : `Showing ${productGroups.length.toLocaleString()} products from ${filteredProducts.length.toLocaleString()} matching color rows`}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            color="dark"
            onClick={() => {
              setSearch("");
              setSaleFilter("all");
              setBrand(null);
              setColor(null);
              setMinDiscount(0);
            }}
          >
            Reset filters
          </Button>
        </Group>
      </Paper>

      {error != null ? (
        <Alert color="red" title="Latest products could not load">
          {error}
        </Alert>
      ) : null}

      {isLoading ? (
        <Center h={320}>
          <Stack align="center" gap="sm">
            <Loader color="dark" />
            <Text c="dimmed">Loading latest products</Text>
          </Stack>
        </Center>
      ) : productGroups.length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
          {productGroups.map((group) => (
            <ProductCard key={group.productNo} group={group} />
          ))}
        </SimpleGrid>
      ) : (
        <Center h={260}>
          <Text c="dimmed">No products match the current filters.</Text>
        </Center>
      )}
    </Stack>
  );
}

function ProductCard({ group }: { group: ProductGroup }) {
  const leadColor = group.leadColor;
  const effectivePrice = leadColor.salePrice ?? leadColor.originalPrice;
  const discount = getDiscountPercent(leadColor.salePercent);
  const hasSale = leadColor.salePrice != null;
  const otherColors = group.colors.filter((color) => color.colorId !== leadColor.colorId);
  const visibleOtherColors = otherColors.slice(0, 4);
  const hiddenColorCount = Math.max(otherColors.length - visibleOtherColors.length, 0);

  return (
    <Card
      component={Link}
      href={`/products/${group.productNo}`}
      withBorder
      radius="sm"
      padding="md"
      style={{ color: "inherit", textDecoration: "none" }}
    >
      <Stack gap="md" h="100%">
        <Group justify="space-between" align="start" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <ColorSwatch
              color={getColorSwatch(leadColor.colorName ?? leadColor.colorId)}
              size={30}
            />
            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                Best color
              </Text>
              <Text size="sm" fw={700} lineClamp={1}>
                {leadColor.colorName ?? `Color ${leadColor.colorId}`}
              </Text>
            </Box>
          </Group>
          {hasSale ? (
            <Badge color="red" variant="light">
              {formatPercent(discount)} off
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              Full price
            </Badge>
          )}
        </Group>

        <Box>
          <Text fw={750} lineClamp={2}>
            {group.productName ?? `Product ${group.productNo}`}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {group.productBrand ?? "Unknown brand"} · {group.colors.length} matching{" "}
            {group.colors.length === 1 ? "color" : "colors"}
          </Text>
          <Text size="xs" c="dimmed">
            #{group.productNo}
          </Text>
        </Box>

        <Group gap="xs" align="baseline">
          <Text size="xl" fw={850}>
            {formatMoney(effectivePrice)}
          </Text>
          {hasSale ? (
            <Text c="dimmed" td="line-through">
              {formatMoney(leadColor.originalPrice)}
            </Text>
          ) : null}
        </Group>

        {otherColors.length > 0 ? (
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Other matching colors
            </Text>
            <Stack gap={6}>
              {visibleOtherColors.map((color) => (
                <Group key={color.colorId} justify="space-between" gap="xs" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <ColorSwatch
                      color={getColorSwatch(color.colorName ?? color.colorId)}
                      size={16}
                    />
                    <Text size="xs" lineClamp={1}>
                      {color.colorName ?? `Color ${color.colorId}`}
                    </Text>
                  </Group>
                  <Text size="xs" fw={700}>
                    {formatMoney(color.salePrice ?? color.originalPrice)}
                  </Text>
                </Group>
              ))}
            </Stack>
            {hiddenColorCount > 0 ? (
              <Text size="xs" c="dimmed">
                +{hiddenColorCount} more colors
              </Text>
            ) : null}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            Only one matching color for the current filters.
          </Text>
        )}

        <Box mt="auto">
          <Group justify="space-between" mb={6}>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Sale quality
            </Text>
            <Text size="xs" fw={700}>
              {hasSale ? formatPercent(discount) : "0%"}
            </Text>
          </Group>
          <Progress
            value={hasSale ? Math.min(discount, 100) : 0}
            color={hasSale ? "red" : "gray"}
            size="sm"
            radius="xl"
          />
          <Text size="xs" c="dimmed" mt="xs">
            Scraped {formatShortDate(leadColor.scrapedDate)}
          </Text>
        </Box>
      </Stack>
    </Card>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <Paper withBorder p="md" radius="sm" bg="white">
      <Text size="xs" c="dimmed" tt="uppercase" fw={800}>
        {metric.label}
      </Text>
      <Text size="xl" fw={850}>
        {metric.value}
      </Text>
      <Text size="sm" c="dimmed">
        {metric.detail}
      </Text>
    </Paper>
  );
}

function uniqueOptions(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value != null))).sort(
    (first, second) => first.localeCompare(second),
  );
}

function groupProductsByBestDeal(products: PriceRow[]): ProductGroup[] {
  const groups = new Map<number, ProductGroup>();

  for (const product of products) {
    const existingGroup = groups.get(product.productNo);

    if (existingGroup == null) {
      groups.set(product.productNo, {
        productNo: product.productNo,
        productName: product.productName,
        productBrand: product.productBrand,
        productUrl: product.productUrl,
        colors: [product],
        leadColor: product,
      });
      continue;
    }

    existingGroup.colors.push(product);

    if (compareDealStrength(product, existingGroup.leadColor) < 0) {
      existingGroup.leadColor = product;
    }
  }

  return Array.from(groups.values()).sort((first, second) =>
    compareDealStrength(first.leadColor, second.leadColor),
  );
}

function compareDealStrength(first: PriceRow, second: PriceRow): number {
  const firstDiscount = getDiscountPercent(first.salePercent);
  const secondDiscount = getDiscountPercent(second.salePercent);

  if (firstDiscount !== secondDiscount) {
    return secondDiscount - firstDiscount;
  }

  const firstPrice = first.salePrice ?? first.originalPrice ?? Infinity;
  const secondPrice = second.salePrice ?? second.originalPrice ?? Infinity;

  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return Date.parse(second.scrapedDate) - Date.parse(first.scrapedDate);
}

function getLatestScrapeDate(products: PriceRow[]): string | null {
  if (products.length === 0) {
    return null;
  }

  return products.reduce((latest, product) => {
    return Date.parse(product.scrapedDate) > Date.parse(latest)
      ? product.scrapedDate
      : latest;
  }, products[0].scrapedDate);
}

function getPercentage(count: number, total: number): string {
  if (total === 0) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}

function getDiscountPercent(value: number | null): number {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }

  return value > 0 && value <= 1 ? value * 100 : value;
}

function getColorSwatch(value: string | null): string {
  if (value == null) {
    return "#8f8a82";
  }

  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 34%, 42%)`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatMoney(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
