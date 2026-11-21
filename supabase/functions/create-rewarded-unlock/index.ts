import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
function reply(status:number, body:Record<string,unknown>) { return new Response(JSON.stringify(body), {status,headers:{...headers,"Content-Type":"application/json"}}); }
Deno.serve(async (req:Request) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers});
  if(req.method!=="POST") return reply(405,{error:"method_not_allowed"});
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return reply(503,{error:"server_not_configured"});
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer ")) return reply(401,{error:"authentication_required"});
  let body:{dramaId?:unknown}; try{body=await req.json();}catch{return reply(400,{error:"invalid_json"});}
  const dramaId=body?.dramaId;
  if(typeof dramaId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dramaId)) return reply(400,{error:"invalid_drama_id"});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await admin.auth.getUser(auth.slice(7));
  if(userError||!userData.user) return reply(401,{error:"invalid_session"});
  const {data:drama,error:dramaError}=await admin.from("dramas").select("id,is_premium,published").eq("id",dramaId).eq("published",true).eq("is_premium",true).maybeSingle();
  if(dramaError) return reply(503,{error:"premium_catalogue_check_failed"}); if(!drama) return reply(404,{error:"premium_episode_not_found"});
  const {data:existing,error:existingError}=await admin.from("nexora_episode_entitlements").select("id").eq("user_id",userData.user.id).eq("drama_id",dramaId).maybeSingle();
  if(existingError) return reply(503,{error:"entitlement_check_failed"}); if(existing) return reply(409,{error:"episode_already_unlocked"});
  const {data:attemptRows,error:attemptError}=await admin.rpc("create_nexora_rewarded_unlock_attempt",{
    p_user_id:userData.user.id,
    p_drama_id:dramaId
  });
  if(attemptError) return reply(503,{error:"reward_attempt_create_failed"});
  const attempt=Array.isArray(attemptRows)?attemptRows[0]:null;
  if(attempt?.error_code==="rate_limited") return reply(429,{error:"reward_attempt_rate_limited",retryAfterSeconds:900});
  if(!attempt?.attempt_id||!attempt?.expires_at) return reply(503,{error:"reward_attempt_create_failed"});
  return reply(200,{nonce:attempt.attempt_id,expiresAt:attempt.expires_at});
});
