'use strict';
let sgaiSessionEpoch=0;
const sgaiSessionResources=new Set();
function sgaiCaptureSession(){
  try{
  if(localStorage.getItem('sgai_session_transition'))return null;
  const email=localStorage.getItem('sgai_user_email'),token=localStorage.getItem('sgai_auth_token');
  return typeof email==='string'&&email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)&&token?
    Object.freeze({email,token,epoch:sgaiSessionEpoch}):null;
  }catch(_){return null;}
}
function sgaiCaptureAuthState(){return {email:localStorage.getItem('sgai_user_email'),token:localStorage.getItem('sgai_auth_token'),epoch:sgaiSessionEpoch};}
function sgaiAssertAuthState(state){
  if(state.epoch!==sgaiSessionEpoch||state.email!==localStorage.getItem('sgai_user_email')||state.token!==localStorage.getItem('sgai_auth_token'))throw new Error('Your account changed. Please sign in again.');
}
function sgaiSessionCurrent(session){
  try{return !!session&&!localStorage.getItem('sgai_session_transition')&&session.epoch===sgaiSessionEpoch&&localStorage.getItem('sgai_user_email')===session.email&&localStorage.getItem('sgai_auth_token')===session.token;}
  catch(_){return false;}
}
function sgaiAssertSession(session){if(!sgaiSessionCurrent(session))throw new Error('Your account changed. Please sign in again.');}
function sgaiSessionResource(dispose){sgaiSessionResources.add(dispose);return()=>sgaiSessionResources.delete(dispose);}
function sgaiInvalidateSession(reload=false){
  sgaiSessionEpoch++;
  for(const dispose of [...sgaiSessionResources]){try{dispose();}catch(_){}}
  sgaiSessionResources.clear();
  if(reload){
    // Hide the entire document, including embedded media, before reload starts.
    if(typeof document!=='undefined'&&document.documentElement)document.documentElement.style.visibility='hidden';
    location.reload();
  }
}
function sgaiSetSession(email,token){
  if(typeof email!=='string'||!email||typeof token!=='string'||!token)throw new Error('Invalid sign-in response.');
  const previous=localStorage.getItem('sgai_user_email');
  sgaiInvalidateSession();
  localStorage.setItem('sgai_session_transition','1');
  try{
    localStorage.setItem('sgai_user_email',email);localStorage.setItem('sgai_auth_token',token);
    localStorage.removeItem('sgai_session_transition');
  }catch(error){sgaiInvalidateSession(true);throw error;}
  if(previous&&previous!==email){sgaiInvalidateSession(true);return false;}
  return true;
}
function sgaiClearSession(){
  sgaiInvalidateSession();
  try{
    localStorage.setItem('sgai_session_transition','1');
    localStorage.removeItem('sgai_user_email');localStorage.removeItem('sgai_auth_token');
    localStorage.removeItem('sgai_session_transition');
  }finally{sgaiInvalidateSession(true);}
}
function sgaiGuardResponse(response,session){
  sgaiAssertSession(session);
  for(const name of ['json','blob','text','arrayBuffer']){
    if(typeof response[name]!=='function')continue;
    const read=response[name].bind(response);
    response[name]=async(...args)=>{sgaiAssertSession(session);const data=await read(...args);sgaiAssertSession(session);return data;};
  }
  if(typeof response.clone==='function'){
    const clone=response.clone.bind(response);response.clone=()=>sgaiGuardResponse(clone(),session);
  }
  return response;
}
if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('storage',event=>{
    if(event.key===null||['sgai_user_email','sgai_auth_token'].includes(event.key))sgaiInvalidateSession(true);
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)sgaiInvalidateSession(true);});
}
