import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { parseFounderAllowlist } from "@/lib/founder-os";
import AiOutreachDashboard from "@/components/ai-outreach-dashboard";
export default async function AiOutreachPage(){const {userId}=await auth();if(!userId)redirect("/");if(!parseFounderAllowlist().includes(userId))redirect("/dashboard");return <AiOutreachDashboard/>;}
