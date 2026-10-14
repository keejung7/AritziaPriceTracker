import { Container } from "@mantine/core";
import ProductPriceHistoryExplorer from "../../components/ProductPriceHistoryExplorer";

interface ProductPageProps {
  params: Promise<{
    productNo: string;
  }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { productNo } = await params;

  return (
    <main>
      <Container size="xl" py="xl">
        <ProductPriceHistoryExplorer productNo={productNo} />
      </Container>
    </main>
  );
}
