import { NextRequest, NextResponse } from "next/server";

const { getProductPriceForDate } = require("../../../../../../db/queries");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productNo: string; date: string }> },
) {
  const { productNo: productNoParam, date } = await params;
  const productNo = Number(productNoParam);

  if (!Number.isInteger(productNo)) {
    return NextResponse.json(
      { error: "Invalid product number" },
      { status: 400 },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date. Expected YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const rows = await getProductPriceForDate({
    productNo,
    date,
  });

  return NextResponse.json(rows);
}
