import { createClient } from "npm:@supabase/supabase-js@2";
const AD_UNIT_ID="ca-app-pub-4497851143738030/5422109728";
const KEY_URL="https://www.gstatic.com/admob/reward/verifier-keys.json";
let cache:{expiresAt:number,keys:Map<string,CryptoKey>}|null=null;
function reply(status:number,text:string){return new Response(text,{status,headers:{"Content-Type":"text/plain; charset=utf-8"}});}
function b64(value:string):Uint8Array{const v=value.replace(/-/g,"+").replace(/_/g,"/");const bin=atob(v.padEnd(Math.ceil(v.length/4)*4,"="));return Uint8Array.from(bin,c=>c.charCodeAt(0));}
function derRaw(der:Uint8Array):Uint8Array{
 let i=0;if(der[i++]!==0x30)throw new Error("bad_der");let n=der[i++];if(n&128){const count=n&127;if(count<1||count>2)throw new Error("bad_der");n=0;for(let j=0;j<count;j++)n=(n<<8)|der[i++];}
 if(i+n!==der.length||der[i++]!==2)throw new Error("bad_der");const rl=der[i++];let r=der.slice(i,i+rl);i+=rl;if(der[i++]!==2)throw new Error("bad_der");const sl=der[i++];let s=der.slice(i,i+sl);
 if(r.length===33&&r[0]===0)r=r.slice(1);if(s.length===33&&s[0]===0)s=s.slice(1);if(r.length>32||s.length>32)throw new Error("bad_der");
 const raw=new Uint8Array(64);raw.set(r,32-r.length);raw.set(s,64-s.length);return raw;
}
async function getKeys():Promise<Map<string,CryptoKey>>{
 if(cache&&cache.expiresAt>Date.now())return cache.keys;
 const response=await fetch(KEY_URL);if(!response.ok)throw new Error("keys_unavailable");const json=await response.json();const keys=new Map<string,CryptoKey>();
 for(const item of json.keys||[]){if(!item.keyId||!(item.pem||item.base64))continue;const pem=String(item.pem||item.base64).replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\\s/g,"");const key=await crypto.subtle.importKey("spki",b64(pem),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);keys.set(String(item.keyId),key);}
 cache={keys,expiresAt:Date.now()+12*60*60*1000};return keys;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="GET")return reply(405,"method_not_allowed");
 const raw=new URL(req.url).search.slice(1),parts=raw.split("&"),sigIndex=parts.findIndex(p=>p.startsWith("signature="));
 if(sigIndex<1||sigIndex!==parts.length-2||!parts[parts.length-1].startsWith("key_id="))return reply(400,"invalid_callback_parameters");
 const params=new URLSearchParams(raw),signature=params.get("signature"),keyId=params.get("key_id");if(!signature||!keyId)return reply(400,"missing_signature");
 try{
  const key=(await getKeys()).get(keyId);if(!key)return reply(400,"unknown_verifier_key");
  const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,derRaw(b64(signature)),new TextEncoder().encode(parts.slice(0,sigIndex).join("&")));
  if(!valid)return reply(403,"invalid_signature");
  const adUnit=params.get("ad_unit")||"",userId=params.get("user_id")||"",nonce=params.get("custom_data")||"",transactionId=params.get("transaction_id")||"",rewardItem=params.get("reward_item")||"",rewardAmount=Number(params.get("reward_amount")),timestamp=Number(params.get("timestamp"));
  if(adUnit!==AD_UNIT_ID||!transactionId||!nonce||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)||!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(rewardAmount))return reply(400,"invalid_reward_fields");
  const expectedItem=Deno.env.get("ADMOB_REWARD_ITEM")||"premium_episode",expectedAmount=Number(Deno.env.get("ADMOB_REWARD_AMOUNT")||"1");
  if(rewardItem!==expectedItem||rewardAmount!==expectedAmount)return reply(403,"unexpected_reward");
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!serviceKey)return reply(503,"server_not_configured");
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:attempt,error:attemptError}=await admin.from("nexora_rewarded_unlock_attempts").select("id,user_id,drama_id,status,expires_at").eq("id",nonce).maybeSingle();
  if(attemptError)return reply(503,"attempt_lookup_failed");
  if(!attempt||attempt.status!=="pending"||attempt.user_id!==userId||new Date(attempt.expires_at).getTime()<Date.now())return reply(403,"invalid_or_expired_attempt");
  const {error:txError}=await admin.from("nexora_rewarded_ad_transactions").upsert({transaction_id:transactionId,attempt_id:attempt.id,user_id:userId,drama_id:attempt.drama_id,ad_unit:adUnit,reward_item:rewardItem,reward_amount:rewardAmount,callback_timestamp:timestamp},{onConflict:"transaction_id",ignoreDuplicates:true});
  if(txError)return reply(503,"transaction_record_failed");
  const {error:grantError}=await admin.from("nexora_episode_entitlements").upsert({user_id:userId,drama_id:attempt.drama_id,source:"admob_rewarded",transaction_id:transactionId},{onConflict:"user_id,drama_id",ignoreDuplicates:true});
  if(grantError)return reply(503,"entitlement_grant_failed");
  const {error:updateError}=await admin.from("nexora_rewarded_unlock_attempts").update({status:"rewarded",rewarded_at:new Date().toISOString()}).eq("id",attempt.id).eq("status","pending");
  if(updateError)return reply(503,"attempt_update_failed");return reply(200,"reward_granted");
 }catch(error){console.error("AdMob SSV callback verification failed",error);return reply(503,"verification_unavailable");}
});
