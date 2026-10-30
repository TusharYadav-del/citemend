// Setup check only; this endpoint does not perform an audit.
export async function GET() {
  return Response.json({
    status: "ok",
    message: "CiteMind audit API placeholder",
  });
}
