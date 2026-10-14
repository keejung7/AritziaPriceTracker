import { NextRequest, NextResponse } from 'next/server';
import { getCatalogProducts, parseCatalogQuery } from '../../../services/catalogService';
import { CatalogError } from '../../../services/catalogTypes';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getCatalogProducts(parseCatalogQuery(request.nextUrl.searchParams)));
  } catch (error) {
    if (error instanceof CatalogError) return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    return NextResponse.json({error:{code:'catalog_unavailable',message:'The catalog is temporarily unavailable'}},{status:503});
  }
}
