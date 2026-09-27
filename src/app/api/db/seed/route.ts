import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/db/seed";

export async function POST(req: Request) {
  try {
    let forceReset = false;
    try {
      const body = await req.json();
      forceReset = Boolean(body.reset);
    } catch {
      // Empty body is okay
    }

    const result = await seedDatabase(forceReset);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Database seed failed";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await seedDatabase(false);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Database seed failed";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}
