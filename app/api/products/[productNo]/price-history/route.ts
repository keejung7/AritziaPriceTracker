// URL: /api/products/:productNo/price-history

import { NextRequest, NextResponse } from "next/server";

const { getProductPriceHistory } = require("../../../../../db/queries");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productNo: string }> },
) {
  const { productNo: productNoParam } = await params;
  const productNo = Number(productNoParam);

  if (!Number.isInteger(productNo)) {
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

  return NextResponse.json(rows);
}
