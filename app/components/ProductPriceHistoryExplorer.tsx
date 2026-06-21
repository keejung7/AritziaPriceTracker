"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  ColorSwatch,
  Divider,
  Grid,
  GridCol,
  Group,
  Loader,
  MultiSelect,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { LineChart } from "@mantine/charts";
import type {
  ProductColorPriceHistory,
  ProductPrice,
  ProductPriceHistory,
} from "../services/priceHistoryService";

interface ProductPriceHistoryExplorerProps {
  productNo: string;
}

interface ChartPoint {
  date: string;
  [colorKey: string]: number | string | null;
}

interface ProductMetrics {
  colorCount: number;
  observationCount: number;
  currentPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}

interface SnapshotRow {
  color: ProductColorPriceHistory;
  point: ProductPrice;
}

const CHART_COLORS = [
  "red.7",
  "blue.7",
  "green.7",
  "grape.7",
  "orange.7",
  "cyan.7",
  "pink.7",
  "teal.7",
  "indigo.7",
  "lime.8",
];

const DEFAULT_VISIBLE_COLOR_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function ProductPriceHistoryExplorer({
  productNo,
}: ProductPriceHistoryExplorerProps) {
  const [product, setProduct] = useState<ProductPriceHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleColorIds, setVisibleColorIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPriceHistory() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/products/${productNo}/price-history`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Price history request failed with ${response.status}`);
        }

        const history = (await response.json()) as ProductPriceHistory | null;

        if (!controller.signal.aborted) {
          setProduct(history);
          setVisibleColorIds(
            history == null ? [] : getDefaultVisibleColorIds(history.colors),
          );
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load product price history.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadPriceHistory();

    return () => controller.abort();
  }, [productNo]);

  const productMetrics = useMemo(() => {
    if (product == null) {
      return null;
    }

    const allPrices = product.colors.flatMap((color) =>
      color.history.map((point) => getEffectivePrice(point)).filter(isNumber),
    );
    const latestPoint = getLatestPoint(product.colors);

    return {
      colorCount: product.colors.length,
      observationCount: product.colors.reduce(
        (total, color) => total + color.history.length,
        0,
      ),
      currentPrice: latestPoint == null ? null : getEffectivePrice(latestPoint),
      lowPrice: allPrices.length === 0 ? null : Math.min(...allPrices),
      highPrice: allPrices.length === 0 ? null : Math.max(...allPrices),
    };
  }, [product]);

  if (isLoading) {
    return (
      <Center h={420}>
        <Stack align="center" gap="sm">
          <Loader color="dark" />
          <Text c="dimmed">Loading price history</Text>
        </Stack>
      </Center>
    );
  }

  if (error != null) {
    return (
      <Stack gap="lg">
        <BackLink />
        <Alert color="red" title="Price history could not load">
          {error}
        </Alert>
      </Stack>
    );
  }

  if (product == null || productMetrics == null) {
    return (
      <Stack gap="lg">
        <BackLink />
        <Paper withBorder radius="sm" p="xl">
          <Title order={1}>Product {productNo}</Title>
          <Text c="dimmed">No price history is available for this product.</Text>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <BackLink />
      <ProductOverviewPanel
        product={product}
        metrics={productMetrics}
        visibleColorIds={visibleColorIds}
        onVisibleColorIdsChange={setVisibleColorIds}
      />
    </Stack>
  );
}

function BackLink() {
  return (
    <Anchor component={Link} href="/" size="sm">
      Back to latest products
    </Anchor>
  );
}

function ProductOverviewPanel({
  product,
  metrics,
  visibleColorIds,
  onVisibleColorIdsChange,
}: {
  product: ProductPriceHistory;
  metrics: ProductMetrics;
  visibleColorIds: string[];
  onVisibleColorIdsChange: (colorIds: string[]) => void;
}) {
  const visibleColors = useMemo(() => {
    const visibleIds = new Set(visibleColorIds);
    return product.colors.filter((color) => visibleIds.has(color.colorId));
  }, [product.colors, visibleColorIds]);

  const chartData = useMemo(() => getCombinedChartData(visibleColors), [visibleColors]);
  const series = useMemo(() => {
    return visibleColors.map((color) => ({
      name: getSeriesKey(color),
      label: color.colorName ?? `Color ${color.colorId}`,
      color: getSeriesColor(color, product.colors),
    }));
  }, [product.colors, visibleColors]);

  const colorOptions = useMemo(() => {
    return product.colors.map((color) => ({
      value: color.colorId,
      label: color.colorName ?? `Color ${color.colorId}`,
    }));
  }, [product.colors]);

  const snapshots = useMemo(() => getRecentSnapshots(product.colors, 12), [product.colors]);

  return (
    <Paper withBorder radius="md" shadow="xs" bg="white">
      <Grid gap={0}>
        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="lg" p="xl" bg="#fbfaf8" h="100%">
            <Box>
              <Text size="sm" fw={800} c="red.7" tt="uppercase">
                Product history
              </Text>
              <Text size="sm" c="dimmed">
                {product.productBrand ?? "Unknown brand"} · #{product.productNo}
              </Text>
              <Title order={1} size="h2">
                {product.productName ?? `Product ${product.productNo}`}
              </Title>
              <Group gap="xs" mt="sm">
                <Badge color="red" variant="light">
                  {formatMoney(metrics.currentPrice)}
                </Badge>
                <Badge color="dark" variant="light">
                  {metrics.colorCount} colors
                </Badge>
              </Group>
            </Box>

            <Button
              component="a"
              href={product.productUrl}
              target="_blank"
              rel="noreferrer"
              color="dark"
              fullWidth
            >
              Open product
            </Button>

            <SimpleGrid cols={2} spacing="sm">
              <MetricCard label="Current" value={formatMoney(metrics.currentPrice)} />
              <MetricCard label="Low" value={formatMoney(metrics.lowPrice)} />
              <MetricCard label="High" value={formatMoney(metrics.highPrice)} />
              <MetricCard
                label="Snapshots"
                value={metrics.observationCount.toLocaleString()}
              />
            </SimpleGrid>

            <Divider />

            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" fw={750}>
                  Tracked colors
                </Text>
                <Text size="xs" c="dimmed">
                  latest / low
                </Text>
              </Group>
              <ScrollArea h={280}>
                <Stack gap="xs" pr="sm">
                  {product.colors.map((color) => {
                    const latestPoint = getLatestPointForColor(color);

                    return (
                      <Paper key={color.colorId} withBorder radius="sm" p="sm" bg="white">
                        <Group justify="space-between" align="start" wrap="nowrap">
                          <Group gap="xs" wrap="nowrap">
                            <ColorSwatch
                              color={getColorSwatch(color.colorName ?? color.colorId)}
                              size={18}
                            />
                            <Box>
                              <Text size="sm" fw={650} lineClamp={1}>
                                {color.colorName ?? `Color ${color.colorId}`}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {color.history.length} observations
                              </Text>
                            </Box>
                          </Group>
                          <Box ta="right">
                            <Text size="sm" fw={750}>
                              {formatMoney(getEffectivePrice(latestPoint))}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {formatMoney(getLowPrice(color.history))}
                            </Text>
                          </Box>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="lg" p="xl">
            <Group justify="space-between" align="start" gap="md">
              <Box>
                <Title order={2} size="h3">
                  Effective price over full range
                </Title>
                <Text size="sm" c="dimmed">
                  Dates without snapshots stay on the x-axis so price progression
                  remains proportional.
                </Text>
              </Box>
              <Badge color="dark" variant="light">
                {visibleColors.length} of {product.colors.length} colors
              </Badge>
            </Group>

            <MultiSelect
              label="Visible colors"
              placeholder="Search and select colors"
              data={colorOptions}
              value={visibleColorIds}
              onChange={onVisibleColorIdsChange}
              searchable
              clearable
              hidePickedOptions={false}
              maxDropdownHeight={280}
            />

            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="dark"
                onClick={() =>
                  onVisibleColorIdsChange(
                    getLatestColorIds(product.colors, DEFAULT_VISIBLE_COLOR_LIMIT),
                  )
                }
              >
                Latest 5
              </Button>
              <Button
                size="xs"
                variant="light"
                color="dark"
                onClick={() =>
                  onVisibleColorIdsChange(
                    getSaleColorIds(product.colors, DEFAULT_VISIBLE_COLOR_LIMIT),
                  )
                }
              >
                On sale
              </Button>
              <Button
                size="xs"
                variant="light"
                color="dark"
                onClick={() =>
                  onVisibleColorIdsChange(
                    getLowestPriceColorIds(product.colors, DEFAULT_VISIBLE_COLOR_LIMIT),
                  )
                }
              >
                Lowest price
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="dark"
                onClick={() =>
                  onVisibleColorIdsChange(product.colors.map((color) => color.colorId))
                }
              >
                All
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="dark"
                onClick={() => onVisibleColorIdsChange([])}
              >
                Clear
              </Button>
            </Group>

            {visibleColors.length > 0 ? (
              <Group gap="xs">
                {visibleColors.map((color) => (
                  <Badge
                    key={color.colorId}
                    color={getSeriesColor(color, product.colors)}
                    variant="light"
                  >
                    {color.colorName ?? `Color ${color.colorId}`}
                  </Badge>
                ))}
              </Group>
            ) : null}

            <Paper withBorder radius="sm" p="md">
              {chartData.length > 1 && series.length > 0 ? (
                <LineChart
                  h={360}
                  data={chartData}
                  dataKey="date"
                  series={series}
                  curveType="linear"
                  connectNulls
                  valueFormatter={formatMoney}
                  yAxisProps={{ tickFormatter: formatMoney }}
                  xAxisProps={{ minTickGap: 28, tickFormatter: formatShortDate }}
                />
              ) : (
                <Center h={260}>
                  <Text c="dimmed">
                    Select at least one color with multiple price points to draw a graph.
                  </Text>
                </Center>
              )}
            </Paper>

            <SnapshotTable snapshots={snapshots} />
          </Stack>
        </GridCol>
      </Grid>
    </Paper>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="md" radius="sm" bg="white">
      <Text size="xs" c="dimmed" tt="uppercase" fw={800}>
        {label}
      </Text>
      <Text size="xl" fw={850}>
        {value}
      </Text>
    </Paper>
  );
}

function SnapshotTable({ snapshots }: { snapshots: SnapshotRow[] }) {
  return (
    <Paper withBorder radius="sm">
      <ScrollArea>
        <Table verticalSpacing="sm" miw={760}>
          <Table.Thead bg="#fbfaf8">
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Color</Table.Th>
              <Table.Th>Effective</Table.Th>
              <Table.Th>Original</Table.Th>
              <Table.Th>Signal</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {snapshots.length > 0 ? (
              snapshots.map(({ color, point }) => {
                const hasSale = point.salePrice != null;

                return (
                  <Table.Tr key={`${color.colorId}-${point.scrapedDate}`}>
                    <Table.Td>{formatShortDate(point.scrapedDate)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <ColorSwatch
                          color={getColorSwatch(color.colorName ?? color.colorId)}
                          size={18}
                        />
                        <Text size="sm">{color.colorName ?? `Color ${color.colorId}`}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={750}>{formatMoney(getEffectivePrice(point))}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c={hasSale ? "dimmed" : undefined} td={hasSale ? "line-through" : undefined}>
                        {formatMoney(point.originalPrice)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {hasSale ? (
                        <Badge color="red" variant="light">
                          Sale
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light">
                          Full price
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Center h={140}>
                    <Text c="dimmed">No price snapshots available.</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}

function getCombinedChartData(colors: ProductColorPriceHistory[]): ChartPoint[] {
  const pointsByDate = new Map<string, ChartPoint>();
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const color of colors) {
    for (const point of color.history) {
      const date = toDateKey(point.scrapedDate);
      const existingPoint = pointsByDate.get(date) ?? { date };

      existingPoint[getSeriesKey(color)] = getEffectivePrice(point);
      pointsByDate.set(date, existingPoint);

      if (firstDate == null || date < firstDate) {
        firstDate = date;
      }

      if (lastDate == null || date > lastDate) {
        lastDate = date;
      }
    }
  }

  if (firstDate == null || lastDate == null) {
    return [];
  }

  const chartData: ChartPoint[] = [];

  for (
    let timestamp = parseDateKey(firstDate);
    timestamp <= parseDateKey(lastDate);
    timestamp += MS_PER_DAY
  ) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    chartData.push(pointsByDate.get(date) ?? { date });
  }

  return chartData;
}

function getRecentSnapshots(
  colors: ProductColorPriceHistory[],
  limit: number,
): SnapshotRow[] {
  return colors
    .flatMap((color) => color.history.map((point) => ({ color, point })))
    .sort(
      (first, second) =>
        Date.parse(second.point.scrapedDate) - Date.parse(first.point.scrapedDate),
    )
    .slice(0, limit);
}

function getSeriesKey(color: ProductColorPriceHistory): string {
  return `color-${color.colorId}`;
}

function getSeriesColor(
  color: ProductColorPriceHistory,
  colors: ProductColorPriceHistory[],
): string {
  const colorIndex = Math.max(
    colors.findIndex((candidate) => candidate.colorId === color.colorId),
    0,
  );

  return CHART_COLORS[colorIndex % CHART_COLORS.length];
}

function getDefaultVisibleColorIds(colors: ProductColorPriceHistory[]): string[] {
  if (colors.length <= DEFAULT_VISIBLE_COLOR_LIMIT) {
    return colors.map((color) => color.colorId);
  }

  const saleColorIds = getSaleColorIds(colors, DEFAULT_VISIBLE_COLOR_LIMIT);

  return saleColorIds.length > 0
    ? saleColorIds
    : getLowestPriceColorIds(colors, DEFAULT_VISIBLE_COLOR_LIMIT);
}

function getLatestColorIds(
  colors: ProductColorPriceHistory[],
  limit: number,
): string[] {
  return [...colors]
    .sort((first, second) => getLatestTimestamp(second) - getLatestTimestamp(first))
    .slice(0, limit)
    .map((color) => color.colorId);
}

function getSaleColorIds(colors: ProductColorPriceHistory[], limit: number): string[] {
  return [...colors]
    .filter((color) => getLatestPointForColor(color)?.salePrice != null)
    .sort((first, second) => {
      const firstSalePercent = getLatestPointForColor(first)?.salePercent ?? 0;
      const secondSalePercent = getLatestPointForColor(second)?.salePercent ?? 0;

      return secondSalePercent - firstSalePercent;
    })
    .slice(0, limit)
    .map((color) => color.colorId);
}

function getLowestPriceColorIds(
  colors: ProductColorPriceHistory[],
  limit: number,
): string[] {
  return [...colors]
    .sort((first, second) => {
      const firstPrice = getEffectivePrice(getLatestPointForColor(first)) ?? Infinity;
      const secondPrice = getEffectivePrice(getLatestPointForColor(second)) ?? Infinity;

      return firstPrice - secondPrice;
    })
    .slice(0, limit)
    .map((color) => color.colorId);
}

function getLatestTimestamp(color: ProductColorPriceHistory): number {
  const latestPoint = getLatestPointForColor(color);

  return latestPoint == null ? 0 : Date.parse(latestPoint.scrapedDate);
}

function toDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function parseDateKey(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function getLatestPoint(colors: ProductColorPriceHistory[]): ProductPrice | null {
  const points = colors.flatMap((color) => color.history);

  if (points.length === 0) {
    return null;
  }

  return points.reduce((latest, point) =>
    Date.parse(point.scrapedDate) > Date.parse(latest.scrapedDate) ? point : latest,
  );
}

function getLatestPointForColor(color: ProductColorPriceHistory): ProductPrice | null {
  if (color.history.length === 0) {
    return null;
  }

  return color.history.reduce((latest, point) =>
    Date.parse(point.scrapedDate) > Date.parse(latest.scrapedDate) ? point : latest,
  );
}

function getLowPrice(history: ProductPrice[]): number | null {
  const prices = history.map(getEffectivePrice).filter(isNumber);
  return prices.length === 0 ? null : Math.min(...prices);
}

function getEffectivePrice(point: ProductPrice | null): number | null {
  if (point == null) {
    return null;
  }

  return point.salePrice ?? point.originalPrice;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && !Number.isNaN(value);
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
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(date);
}
