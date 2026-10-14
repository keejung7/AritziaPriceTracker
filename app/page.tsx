import { Container } from "@mantine/core";
import LatestProductsExplorer from "./components/LatestProductsExplorer";

export default function HomePage() {
  return (
    <main>
      <Container size="xl" py="xl">
        <LatestProductsExplorer />
      </Container>
    </main>
  );
}
