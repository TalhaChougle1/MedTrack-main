import { NextResponse } from "next/server";
import { initDatabase } from "@/lib/db/init";

export async function GET() {
  try {
    const result = await initDatabase();
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errMessage },
      { status: 500 }
    );
  }
}
