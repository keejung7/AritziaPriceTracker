// URL: /api/products/:productNo/price-history

import { NextRequest, NextResponse } from "next/server";
import { formatProductPriceHistory } from "../../../../services/priceHistoryService";
import { getProductChartHistory } from "../../../../services/productChartService";

const { getProductPriceHistory } = require("../../../../../db/queries");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productNo: string }> },
) {
  const { productNo: productNoParam } = await params;
  const productNo = productNoParam;

  if (!/^[1-9]\d{0,18}$/.test(productNo) || BigInt(productNo) > BigInt('9223372036854775807')) {
    return NextResponse.json(
      { error: "Invalid product number" },
      { status: 400 },
    );
  }

  const { searchParams } = request.nextUrl;

  const rows = await getProductPriceHistory({
    productNo,
    colorId: searchParams.get("colorId"),
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
  });

  const formattedRows = formatProductPriceHistory(rows);

  const completeHistory = !['colorId','dateFrom','dateTo'].some(key => searchParams.has(key));
  return NextResponse.json(formattedRows ? { ...formattedRows, chartHistory: getProductChartHistory(formattedRows.colors, { completeHistory }) } : null);
}
