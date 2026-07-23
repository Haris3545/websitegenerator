import { NextResponse } from "next/server";
import { getFontCatalog } from "@/lib/fonts";

export async function GET() {
  const fonts = await getFontCatalog();
  return NextResponse.json({ fonts });
}
