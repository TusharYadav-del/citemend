import { POST as openBillingPortal } from "@/app/api/billing/portal/route";

export async function POST(request: Request) {
  return openBillingPortal(new Request(request.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "manage" }),
  }));
}
