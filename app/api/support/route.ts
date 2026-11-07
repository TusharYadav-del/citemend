import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerDatabase } from "@/lib/supabase-server";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { createSupportPostHandler } from "@/lib/support-handler";

export const POST = createSupportPostHandler({
  authenticate: async () => {
    const session=await auth(); if(!session.userId)return null;
    const profile=await currentUser(); const email=profile?.emailAddresses.find(x=>x.id===profile.primaryEmailAddressId)?.emailAddress;
    if(!email)return null;
    let plan:"starter"|"growth"|"pro"|"agency"|"enterprise"="starter";
    try{const db=createServerDatabase();const {data}=await db.from("subscriptions").select("plan,status").eq("user_id",session.userId).limit(5);const active=(data??[]).find(x=>x.status==="active")?.plan?.toLowerCase();if(active==="agency"||active==="enterprise"||active==="pro"||active==="growth")plan=active;}catch{}
    return {userId:session.userId,userEmail:email,plan};
  },
  resolveWorkspace: async(userId,domain)=>{
    const db=createServerDatabase();const {data,error}=await db.from("audits").select("id,domain,user_id,created_at").eq("domain",domain).order("created_at",{ascending:false}).limit(100);
    if(error||!data?.length)return null;
    const session=await auth();let access;
    try{access=await resolveWorkspaceAccess(db,userId,session.orgId??null,session.orgRole??null);}catch{return null;}
    const owner=data.find(row=>row.user_id!==null&&access.ownerUserIds.includes(row.user_id));if(!owner)return null;
    return {domain,latestAuditId:owner.id};
  },
  save: async ticket=>{const db=createServerDatabase();const {data,error}=await db.from("support_tickets").insert(ticket).select("id").single();if(error||!data)throw new Error("Ticket persistence failed");return {id:data.id};},
  notify: async ticket=>{
    if(!process.env.RESEND_API_KEY||!process.env.SUPPORT_NOTIFICATION_EMAIL||!process.env.RESEND_FROM_EMAIL)return "not_configured";
    const {Resend}=await import("resend");const resend=new Resend(process.env.RESEND_API_KEY);
    const result=await resend.emails.send({from:process.env.RESEND_FROM_EMAIL,to:process.env.SUPPORT_NOTIFICATION_EMAIL,subject:`[CiteMend ${ticket.priority}] ${ticket.subject}`,text:`Ticket ${ticket.id}\nFrom: ${ticket.user_email}\nWorkspace: ${ticket.workspace_domain??"none"}\nCategory: ${ticket.category}\n\n${ticket.message}\n\nDiagnostics: ${JSON.stringify(ticket.diagnostic_context_json)}`});return !result.error;
  },
});
