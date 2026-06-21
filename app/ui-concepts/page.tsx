"use client";

import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Card,
  ColorSwatch,
  Container,
  Divider,
  Grid,
  GridCol,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { LineChart } from "@mantine/charts";

const products = [
  {
    name: "Contour Crew Longsleeve",
    brand: "Babaton",
    color: "Rich Mocha Brown",
    swatch: "#5b4034",
    price: "$39",
    original: "$68",
    discount: "43%",
    confidence: 86,
    date: "Jun 18",
  },
  {
    name: "Effortless Pant",
    brand: "Wilfred",
    color: "Light Birch",
    swatch: "#dfd8cc",
    price: "$98",
    original: "$148",
    discount: "34%",
    confidence: 72,
    date: "Jun 18",
  },
  {
    name: "Sculpt Knit Squareneck",
    brand: "Babaton",
    color: "Deep Claret",
    swatch: "#5d1f2b",
    price: "$48",
    original: "$78",
    discount: "38%",
    confidence: 79,
    date: "Jun 17",
  },
  {
    name: "Market Jumpsuit",
    brand: "Wilfred Free",
    color: "Black",
    swatch: "#171717",
    price: "$88",
    original: "$168",
    discount: "48%",
    confidence: 94,
    date: "Jun 16",
  },
];

const chartData = [
  { date: "Jun 10", mocha: 68, birch: 148, claret: 78 },
  { date: "Jun 11", mocha: 68, birch: 148, claret: 78 },
  { date: "Jun 12", mocha: 58, birch: 148, claret: 68 },
  { date: "Jun 13", mocha: 58, birch: 118, claret: 68 },
  { date: "Jun 14", mocha: 48, birch: 118, claret: 58 },
  { date: "Jun 15", mocha: 48, birch: 98, claret: 58 },
  { date: "Jun 16", mocha: 39, birch: 98, claret: 48 },
  { date: "Jun 17", mocha: 39, birch: 98, claret: 48 },
];

const metrics = [
  { label: "Tracked styles", value: "412", detail: "+28 this week" },
  { label: "Active markdowns", value: "149", detail: "36% of catalog" },
  { label: "Avg drop", value: "31%", detail: "Sale colors only" },
  { label: "Best watch", value: "$39", detail: "New low today" },
];

export default function UiConceptsPage() {
  return (
    <main>
      <Box bg="#f6f4ef" py={36}>
        <Container size="xl">
          <Stack gap="xl">
            <Group justify="space-between" align="end">
              <Box>
                <Text size="sm" fw={800} c="red.7" tt="uppercase">
                  Mantine layout concepts
                </Text>
                <Title order={1}>Less bare, more contained</Title>
                <Text c="dimmed" maw={780}>
                  Three possible UI directions for the price tracker, using the same
                  product, sale, filter, and chart primitives already in the app.
                </Text>
              </Box>
              <Button component={Link} href="/ui-concepts/product" color="dark">
                Product page concepts
              </Button>
            </Group>

            <ConceptOne />
            <ConceptTwo />
            <ConceptThree />
          </Stack>
        </Container>
      </Box>
    </main>
  );
}

function ConceptOne() {
  return (
    <Paper withBorder radius="md" shadow="xs" bg="white">
      <Grid gap={0}>
        <GridCol span={{ base: 12, md: 3 }}>
          <Stack gap="lg" p="lg" bg="#fbfaf8" h="100%">
            <Box>
              <Text size="xs" fw={800} c="dimmed" tt="uppercase">
                Concept 1
              </Text>
              <Title order={2} size="h3">
                Command center
              </Title>
            </Box>
            <TextInput label="Search" placeholder="Product, color, brand" />
            <Select
              label="Brand"
              placeholder="All brands"
              data={["Babaton", "Wilfred", "Wilfred Free", "Tna"]}
            />
            <Select
              label="Signal"
              placeholder="All signals"
              data={["New low", "Large drop", "Back in stock", "Watch"]}
            />
            <SegmentedControl
              fullWidth
              data={[
                { label: "All", value: "all" },
                { label: "Sale", value: "sale" },
                { label: "Full", value: "full" },
              ]}
            />
            <Divider />
            <Stack gap="xs">
              <Text size="sm" fw={700}>
                Why it works
              </Text>
              <Text size="sm" c="dimmed">
                Filters live in a stable rail, while metrics, charts, and the table
                stay inside one bounded workspace.
              </Text>
            </Stack>
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, md: 9 }}>
          <Stack gap="lg" p="lg">
            <Group justify="space-between" align="center">
              <Box>
                <Title order={3}>Latest markdowns</Title>
                <Text size="sm" c="dimmed">
                  Prioritized by current discount and historical low.
                </Text>
              </Box>
              <Button color="dark" variant="filled">
                Reset view
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
              {metrics.map((metric) => (
                <Paper key={metric.label} withBorder radius="sm" p="md">
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
              ))}
            </SimpleGrid>

            <Paper withBorder radius="sm" p="md">
              <LineChart
                h={220}
                data={chartData}
                dataKey="date"
                series={[
                  { name: "mocha", label: "Mocha", color: "red.7" },
                  { name: "birch", label: "Birch", color: "dark.6" },
                  { name: "claret", label: "Claret", color: "grape.7" },
                ]}
                curveType="linear"
                valueFormatter={(value) => `$${value}`}
                yAxisProps={{ tickFormatter: (value) => `$${value}` }}
              />
            </Paper>

            <ProductTable />
          </Stack>
        </GridCol>
      </Grid>
    </Paper>
  );
}

function ConceptTwo() {
  return (
    <Paper withBorder radius="md" shadow="xs" p="lg" bg="white">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Box>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Concept 2
            </Text>
            <Title order={2} size="h3">
              Product board
            </Title>
            <Text size="sm" c="dimmed" maw={640}>
              A warmer browse-first layout with cards for scanability and a compact
              filter bar above the board.
            </Text>
          </Box>
          <Badge color="red" variant="light" size="lg">
            12 new lows
          </Badge>
        </Group>

        <Paper withBorder radius="sm" p="sm" bg="#fbfaf8">
          <Group grow align="end">
            <TextInput label="Search" placeholder="Find a style" />
            <Select label="Category" placeholder="All categories" data={["Tops", "Pants", "Dresses"]} />
            <Select label="Sort" defaultValue="drop" data={[{ label: "Largest drop", value: "drop" }, { label: "Newest", value: "new" }]} />
            <Button color="dark">Apply</Button>
          </Group>
        </Paper>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {products.map((product) => (
            <Card key={product.name} withBorder radius="sm" padding="md">
              <Stack gap="md">
                <Group justify="space-between" align="start">
                  <ColorSwatch color={product.swatch} size={30} />
                  <Badge color="red" variant="light">
                    {product.discount} off
                  </Badge>
                </Group>
                <Box>
                  <Text fw={750}>{product.name}</Text>
                  <Text size="sm" c="dimmed">
                    {product.brand} · {product.color}
                  </Text>
                </Box>
                <Group gap="xs" align="baseline">
                  <Text size="xl" fw={850}>
                    {product.price}
                  </Text>
                  <Text c="dimmed" td="line-through">
                    {product.original}
                  </Text>
                </Group>
                <Box>
                  <Group justify="space-between" mb={6}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                      Sale quality
                    </Text>
                    <Text size="xs" fw={700}>
                      {product.confidence}%
                    </Text>
                  </Group>
                  <Progress value={product.confidence} color="red" size="sm" radius="xl" />
                </Box>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}

function ConceptThree() {
  return (
    <Paper withBorder radius="md" shadow="xs" p="lg" bg="white">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Box>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Concept 3
            </Text>
            <Title order={2} size="h3">
              Analyst workbench
            </Title>
            <Text size="sm" c="dimmed" maw={700}>
              Best when price history becomes the main object: chart, selected color,
              and row-level evidence are kept in one contained workspace.
            </Text>
          </Box>
          <SegmentedControl data={["Day", "Week", "Month"]} defaultValue="Week" />
        </Group>

        <Tabs defaultValue="history" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="history">History</Tabs.Tab>
            <Tabs.Tab value="colors">Colors</Tabs.Tab>
            <Tabs.Tab value="alerts">Alerts</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="history" pt="lg">
            <Grid>
              <GridCol span={{ base: 12, lg: 8 }}>
                <Paper withBorder radius="sm" p="md" h="100%">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Box>
                        <Title order={3}>Contour Crew Longsleeve</Title>
                        <Text size="sm" c="dimmed">
                          Effective price by selected colors
                        </Text>
                      </Box>
                      <Badge color="dark" variant="light">
                        Full date range
                      </Badge>
                    </Group>
                    <LineChart
                      h={300}
                      data={chartData}
                      dataKey="date"
                      series={[
                        { name: "mocha", label: "Mocha", color: "red.7" },
                        { name: "birch", label: "Birch", color: "dark.6" },
                        { name: "claret", label: "Claret", color: "grape.7" },
                      ]}
                      curveType="linear"
                      valueFormatter={(value) => `$${value}`}
                      yAxisProps={{ tickFormatter: (value) => `$${value}` }}
                    />
                  </Stack>
                </Paper>
              </GridCol>
              <GridCol span={{ base: 12, lg: 4 }}>
                <Stack gap="md">
                  {[
                    ["Current", "$39", "Latest observed price"],
                    ["Historical low", "$39", "Matches best observed price"],
                    ["Drop depth", "43%", "Strong compared with trend"],
                  ].map(([label, value, detail]) => (
                    <Paper key={label} withBorder radius="sm" p="md">
                      <Group gap="sm" align="start">
                        <ThemeIcon color="red" variant="light" radius="xl">
                          {value.slice(0, 1)}
                        </ThemeIcon>
                        <Box>
                          <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                            {label}
                          </Text>
                          <Text size="xl" fw={850}>
                            {value}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {detail}
                          </Text>
                        </Box>
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

function ProductTable() {
  return (
    <Paper withBorder radius="sm">
      <ScrollArea>
        <Table verticalSpacing="sm" miw={820}>
          <Table.Thead bg="#fbfaf8">
            <Table.Tr>
              <Table.Th>Product</Table.Th>
              <Table.Th>Color</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Signal</Table.Th>
              <Table.Th>Scraped</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {products.map((product) => (
              <Table.Tr key={product.name}>
                <Table.Td>
                  <Text fw={700}>{product.name}</Text>
                  <Text size="xs" c="dimmed">
                    {product.brand}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <ColorSwatch color={product.swatch} size={18} />
                    <Text size="sm">{product.color}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Text fw={800}>{product.price}</Text>
                    <Text size="sm" c="dimmed" td="line-through">
                      {product.original}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color="red" variant="light">
                    New low
                  </Badge>
                </Table.Td>
                <Table.Td>{product.date}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
