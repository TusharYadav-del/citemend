const gone = () => Response.json(
  { error: "Beta requests are no longer available. Choose a paid plan at /pricing." },
  { status: 410, headers: { "Cache-Control": "no-store" } },
);

export async function POST() {
  return gone();
}

export async function GET() {
  return gone();
}
