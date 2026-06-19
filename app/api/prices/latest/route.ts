import { NextRequest, NextResponse } from "next/server";
import { formatLatestPrices } from "../../../services/priceHistoryService";

const { getLatestPrices } = require("../../../../db/queries");

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limitParam = searchParams.get("limit");
  const limit = limitParam == null ? 100 : Number(limitParam);

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return NextResponse.json(
      { error: "Invalid limit. Expected an integer from 1 to 500." },
      { status: 400 },
    );
  }

  const saleOnlyParam = searchParams.get("saleOnly");
  const saleOnly = saleOnlyParam === "true";

  const rows = await getLatestPrices({
    limit,
    saleOnly,
  });

  const formattedRows = formatLatestPrices(rows);

  return NextResponse.json(formattedRows);
}
