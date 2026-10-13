"use client";

import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  ColorSwatch,
  Container,
  Divider,
  Grid,
  GridCol,
  Group,
  MultiSelect,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
  Title,
} from "@mantine/core";
import { LineChart } from "@mantine/charts";

const product = {
  name: "Effortless Pant",
  brand: "Wilfred",
  productNo: "77775",
  current: "$98",
  original: "$148",
  low: "$88",
  high: "$148",
  discount: "34%",
  status: "Good markdown",
};

const colors = [
  {
    key: "black",
    name: "Black",
    swatch: "#161616",
    current: "$118",
    low: "$98",
    high: "$148",
    points: 18,
  },
  {
    key: "birch",
    name: "Light Birch",
    swatch: "#d9d2c4",
    current: "$98",
    low: "$88",
    high: "$148",
    points: 21,
  },
  {
    key: "claret",
    name: "Deep Claret",
    swatch: "#54202b",
    current: "$108",
    low: "$108",
    high: "$148",
    points: 14,
  },
  {
    key: "sage",
    name: "Soft Sage",
    swatch: "#9ca58d",
    current: "$148",
    low: "$128",
    high: "$148",
    points: 12,
  },
];

const historyData = [
  { date: "Jun 10", black: 148, birch: 148, claret: 148, sage: 148 },
  { date: "Jun 11", black: 148, birch: 148, claret: 148, sage: 148 },
  { date: "Jun 12", black: 148, birch: 128, claret: 148, sage: 148 },
  { date: "Jun 13", black: 138, birch: 128, claret: 138, sage: 148 },
  { date: "Jun 14", black: 138, birch: 108, claret: 138, sage: 148 },
  { date: "Jun 15", black: 128, birch: 98, claret: 128, sage: 148 },
  { date: "Jun 16", black: 118, birch: 98, claret: 108, sage: 148 },
  { date: "Jun 17", black: 118, birch: 88, claret: 108, sage: 148 },
  { date: "Jun 18", black: 118, birch: 98, claret: 108, sage: 148 },
];

const snapshots = [
  ["Jun 18", "Light Birch", "$98", "$148", "Current sale"],
  ["Jun 17", "Light Birch", "$88", "$148", "Historical low"],
  ["Jun 16", "Deep Claret", "$108", "$148", "New markdown"],
  ["Jun 15", "Black", "$128", "$148", "First drop"],
];

const lineSeries = colors.map((color) => ({
  name: color.key,
  label: color.name,
  color: getSeriesColor(color.key),
}));

function getSeriesColor(colorKey: string): string {
  if (colorKey === "black") {
    return "dark.6";
  }

  if (colorKey === "birch") {
    return "red.7";
  }

  if (colorKey === "claret") {
    return "grape.7";
  }

  return "teal.7";
}

export default function ProductConceptsPage() {
  return (
    <main>
      <Box bg="#f5f2ed" py={36}>
        <Container size="xl">
          <Stack gap="xl">
            <Group justify="space-between" align="end">
              <Box>
                <Text size="sm" fw={800} c="red.7" tt="uppercase">
                  Product page concepts
                </Text>
                <Title order={1}>Product-specific layout proposals</Title>
                <Text c="dimmed" maw={820}>
                  Mock layouts for a single product detail page: price history,
                  color comparison, sale quality, and snapshot evidence.
                </Text>
              </Box>
              <Button component={Link} href="/ui-concepts" color="dark" variant="light">
                All concepts
              </Button>
            </Group>

            <ProductOverview />
            <DecisionWorkbench />
            <ColorIntelligence />
          </Stack>
        </Container>
      </Box>
    </main>
  );
}

function ProductOverview() {
  return (
    <Paper withBorder radius="md" shadow="xs" bg="white">
      <Grid gap={0}>
        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="lg" p="xl" bg="#fbfaf7" h="100%">
            <Box>
              <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                Concept 1
              </Text>
              <Title order={2} size="h3">
                Product overview panel
              </Title>
              <Text size="sm" c="dimmed">
                A contained product header with the decision summary beside the
                full-range chart.
              </Text>
            </Box>

            <Box>
              <Text size="sm" c="dimmed">
                {product.brand} - #{product.productNo}
              </Text>
              <Title order={3}>{product.name}</Title>
              <Group gap="xs" mt="xs">
                <Badge color="red" variant="light">
                  {product.discount} off
                </Badge>
                <Badge color="dark" variant="light">
                  {product.status}
                </Badge>
              </Group>
            </Box>

            <SimpleGrid cols={2}>
              <Metric label="Current" value={product.current} detail="Latest price" />
              <Metric label="Low" value={product.low} detail="Best observed" />
              <Metric label="High" value={product.high} detail="Peak observed" />
              <Metric label="Colors" value="4" detail="Tracked variants" />
            </SimpleGrid>

            <Divider />

            <Stack gap="sm">
              {colors.map((color) => (
                <Group key={color.key} justify="space-between">
                  <Group gap="xs">
                    <ColorSwatch color={color.swatch} size={18} />
                    <Text size="sm">{color.name}</Text>
                  </Group>
                  <Text size="sm" fw={750}>
                    {color.current}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="lg" p="xl">
            <Group justify="space-between">
              <Box>
                <Title order={3}>Effective price over full range</Title>
                <Text size="sm" c="dimmed">
                  Missing days stay visible so progression feels proportional.
                </Text>
              </Box>
              <SegmentedControl data={["All", "Sale", "Low"]} defaultValue="All" />
            </Group>
            <LineChart
              h={340}
              data={historyData}
              dataKey="date"
              series={lineSeries}
              curveType="linear"
              valueFormatter={(value) => `$${value}`}
              yAxisProps={{ tickFormatter: (value) => `$${value}` }}
            />
            <SnapshotTable />
          </Stack>
        </GridCol>
      </Grid>
    </Paper>
  );
}

function DecisionWorkbench() {
  return (
    <Paper withBorder radius="md" shadow="xs" p="xl" bg="white">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Box>
            <Text size="xs" c="dimmed" fw={800} tt="uppercase">
              Concept 2
            </Text>
            <Title order={2} size="h3">
              Decision workbench
            </Title>
            <Text size="sm" c="dimmed" maw={760}>
              Strong for answering one question quickly: is this price worth
              buying now, watching, or ignoring?
            </Text>
          </Box>
          <Button color="dark">Open product</Button>
        </Group>

        <Grid>
          <GridCol span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              <Paper withBorder radius="sm" p="md">
                <Group justify="space-between" mb="md">
                  <Box>
                    <Title order={3}>Price signal</Title>
                    <Text size="sm" c="dimmed">
                      Current price compared with observed range.
                    </Text>
                  </Box>
                  <Badge color="red" variant="filled">
                    Buy zone
                  </Badge>
                </Group>
                <LineChart
                  h={280}
                  data={historyData}
                  dataKey="date"
                  series={[
                    { name: "birch", label: "Light Birch", color: "red.7" },
                    { name: "black", label: "Black", color: "dark.6" },
                  ]}
                  curveType="linear"
                  valueFormatter={(value) => `$${value}`}
                  yAxisProps={{ tickFormatter: (value) => `$${value}` }}
                />
              </Paper>

              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Metric label="Current" value="$98" detail="34% below original" />
                <Metric label="Distance to low" value="$10" detail="Near best price" />
                <Metric label="Volatility" value="Medium" detail="4 changes in 9 days" />
              </SimpleGrid>
            </Stack>
          </GridCol>

          <GridCol span={{ base: 12, md: 4 }}>
            <Paper withBorder radius="sm" p="md" h="100%">
              <Stack gap="md">
                <Title order={3}>Recommendation trail</Title>
                <Timeline active={2} color="red" bulletSize={24} lineWidth={2}>
                  <Timeline.Item title="First markdown">
                    <Text size="sm" c="dimmed">
                      Black dropped from $148 to $128.
                    </Text>
                  </Timeline.Item>
                  <Timeline.Item title="Best observed price">
                    <Text size="sm" c="dimmed">
                      Light Birch reached $88 on Jun 17.
                    </Text>
                  </Timeline.Item>
                  <Timeline.Item title="Current state">
                    <Text size="sm" c="dimmed">
                      Current price is close to low and still below average.
                    </Text>
                  </Timeline.Item>
                </Timeline>
              </Stack>
            </Paper>
          </GridCol>
        </Grid>
      </Stack>
    </Paper>
  );
}

function ColorIntelligence() {
  return (
    <Paper withBorder radius="md" shadow="xs" p="xl" bg="white">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Box>
            <Text size="xs" c="dimmed" fw={800} tt="uppercase">
              Concept 3
            </Text>
            <Title order={2} size="h3">
              Color intelligence
            </Title>
            <Text size="sm" c="dimmed" maw={760}>
              Best if the user compares variants before clicking through to the
              retailer page.
            </Text>
          </Box>
          <MultiSelect
            w={{ base: "100%", sm: 360 }}
            data={colors.map((color) => color.name)}
            defaultValue={["Light Birch", "Deep Claret"]}
            label="Visible colors"
          />
        </Group>

        <Tabs defaultValue="compare" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="compare">Compare</Tabs.Tab>
            <Tabs.Tab value="snapshots">Snapshots</Tabs.Tab>
            <Tabs.Tab value="notes">Notes</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="compare" pt="lg">
            <Grid>
              <GridCol span={{ base: 12, lg: 7 }}>
                <LineChart
                  h={320}
                  data={historyData}
                  dataKey="date"
                  series={lineSeries}
                  curveType="linear"
                  valueFormatter={(value) => `$${value}`}
                  yAxisProps={{ tickFormatter: (value) => `$${value}` }}
                />
              </GridCol>
              <GridCol span={{ base: 12, lg: 5 }}>
                <Stack gap="sm">
                  {colors.map((color) => (
                    <Paper key={color.key} withBorder radius="sm" p="md">
                      <Group justify="space-between" align="start">
                        <Group gap="sm">
                          <ColorSwatch color={color.swatch} size={24} />
                          <Box>
                            <Text fw={750}>{color.name}</Text>
                            <Text size="xs" c="dimmed">
                              {color.points} observations
                            </Text>
                          </Box>
                        </Group>
                        <Text fw={850}>{color.current}</Text>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </GridCol>
            </Grid>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Paper withBorder radius="sm" p="md">
      <Text size="xs" c="dimmed" fw={800} tt="uppercase">
        {label}
      </Text>
      <Text size="xl" fw={850}>
        {value}
      </Text>
      <Text size="sm" c="dimmed">
        {detail}
      </Text>
    </Paper>
  );
}

function SnapshotTable() {
  return (
    <Paper withBorder radius="sm">
      <ScrollArea>
        <Table verticalSpacing="sm" miw={720}>
          <Table.Thead bg="#fbfaf8">
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Color</Table.Th>
              <Table.Th>Sale</Table.Th>
              <Table.Th>Original</Table.Th>
              <Table.Th>Signal</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {snapshots.map(([date, color, sale, original, signal]) => (
              <Table.Tr key={`${date}-${color}`}>
                <Table.Td>{date}</Table.Td>
                <Table.Td>{color}</Table.Td>
                <Table.Td>
                  <Text fw={750}>{sale}</Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" td="line-through">
                    {original}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color="red" variant="light">
                    {signal}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
