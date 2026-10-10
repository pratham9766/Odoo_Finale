import { useEffect, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { request } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
export default function DemoLogin() {
  const navigate = useNavigate();
  const [accounts,setAccounts]=useState([]);
  const [selected,setSelected]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const api=(path,options={})=>request(`/demo${path}`,{baseUrl:import.meta.env.VITE_API_URL || 'http://localhost:4000',...options});
  useEffect(()=>{const controller=new AbortController();api('/accounts',{signal:controller.signal}).then(({data})=>{setAccounts(data);setSelected(data[0]?.id);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);});return()=>controller.abort();},[]);
  async function login(){setBusy(true);setError(null);try{const {data}=await api('/session',{method:'POST',body:{id:selected}});const {error}=await supabase.auth.setSession(data);if(error)throw error;navigate('/app',{replace:true});}catch(err){setError(err.message);}finally{setBusy(false);}}
  return <section className="demo-login"><h3>Explore a demo role</h3><p>Separate demo organizations with real, saved data.</p>{error && <Alert type="error" message={error} className="mb-4" />}<Select aria-label="Demo role" className="w-full mb-4" value={selected} onChange={setSelected} options={accounts.map(account=>({value:account.id,label:`${account.type} · ${account.role}`}))} showSearch optionFilterProp="label" /><Button block loading={busy} disabled={!selected} onClick={login}>Enter demo workspace</Button></section>;
}
