import { authenticatePublicApi } from "@/lib/public-api-auth";
import { handleMcpTool, MCP_TOOLS } from "@/lib/mcp-server";
import { readRequestJson } from "@/lib/read-request-json";
const rpc=(id:unknown,result:unknown)=>Response.json({jsonrpc:"2.0",id,result});
export async function POST(request:Request){
  const parsed=await readRequestJson(request,32768);if(parsed.kind!=="ok"||!parsed.value||typeof parsed.value!=="object"||Array.isArray(parsed.value))return Response.json({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error or request exceeds 32 KiB"}});
  const input=parsed.value as Record<string,unknown>;if(input.jsonrpc!=="2.0"||typeof input.method!=="string")return Response.json({jsonrpc:"2.0",id:input.id??null,error:{code:-32600,message:"Invalid Request"}});
  const params=input.params as Record<string,unknown>|undefined;const permission=input.method==="tools/call"&&params?.name==="citemend_propose_redirect_for_approval"?"recovery:propose":"recovery:read";
  const auth=await authenticatePublicApi(request,permission);if("error"in auth)return Response.json({jsonrpc:"2.0",id:input.id??null,error:{code:auth.status===401?-32001:-32003,message:auth.error}},{status:auth.status});
  if(input.method==="initialize")return rpc(input.id,{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"citemend",version:"1.0.0"}});
  if(input.method==="notifications/initialized")return new Response(null,{status:202});
  if(input.method==="tools/list")return rpc(input.id,{tools:MCP_TOOLS});
  if(input.method==="tools/call"){
    const name=params?.name;const args=(params?.arguments??{}) as Record<string,unknown>;
    try{if(typeof name!=="string")throw new Error("Tool name is required.");const result=await handleMcpTool(auth.db,auth.userId,auth.domain,name,args);return rpc(input.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:false})}
    catch(error){return rpc(input.id,{content:[{type:"text",text:error instanceof Error?error.message:"Tool failed."}],isError:true})}
  }
  return Response.json({jsonrpc:"2.0",id:input.id,error:{code:-32601,message:"Method not found"}});
}
