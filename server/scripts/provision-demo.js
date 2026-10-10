// Explicitly requested demo accounts. Creates only a new, labelled demo namespace.
// Re-running resumes that namespace; it never resets existing passwords or real org data.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { withTenant } from '../src/db/withTenant.js';
import { createOrg } from '../src/modules/auth/me.service.js';
import { ROLE_DEFS } from '../src/modules/staff/defaultRoles.js';

if (env.NODE_ENV !== 'development') throw Error('Demo provisioning requires development mode');
const file = new URL('../.demo-accounts.local.json', import.meta.url);
let manifest;
try { manifest = JSON.parse(await readFile(file,'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; manifest = {namespace:randomBytes(4).toString('hex'),accounts:[],orgs:{}}; }
const save = () => writeFile(file,JSON.stringify(manifest,null,2),{mode:0o600});
const auth = createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
try {
  for (const [type,roles] of Object.entries(ROLE_DEFS)) {
    for (const role of roles) {
      const slug = `${type}-${role.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
      let account = manifest.accounts.find(row => row.slug === slug);
      if (!account) {
        account = {slug,type,role:role.name,email:`${slug}.${manifest.namespace}@sameta.example`,password:randomBytes(24).toString('base64url'),ready:false};
        manifest.accounts.push(account); await save();
      }
      if (!account.id) {
        const {data,error} = await auth.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,user_metadata:{full_name:`Demo ${role.name}`,demo_namespace:manifest.namespace}});
        if (error) throw error;
        account.id=data.user.id; await save();
      }
      if (!manifest.orgs[type]) {
        if (role.name !== 'Owner') throw Error('Owner must be provisioned first');
        const org=await createOrg({id:account.id,email:account.email},{name:`Sameta Demo ${type} ${manifest.namespace}`,types:[type],city:'Bengaluru'});
        manifest.orgs[type]=org.id; await save();
      }
      if (!account.ready) {
        await withTenant({orgId:manifest.orgs[type],userId:account.id},async db => {
          await db.query('insert into profiles(id,email,full_name) values($1,$2,$3) on conflict(id) do nothing',[account.id,account.email,`Demo ${role.name}`]);
          const {rows:[assignedRole]}=await db.query('select id from roles where org_id=$1 and name=$2',[manifest.orgs[type],role.name]);
          if (!assignedRole) throw Error(`Missing role ${type}/${role.name}`);
          await db.query('insert into memberships(org_id,user_id,role_id) values($1,$2,$3) on conflict(org_id,user_id) do nothing',[manifest.orgs[type],account.id,assignedRole.id]);
        });
        account.ready=true; await save();
      }
      console.log(`Ready: ${type} / ${role.name}`);
    }
  }
  console.log(`Provisioned ${manifest.accounts.filter(row=>row.ready).length} demo accounts. Credentials remain in the ignored server manifest.`);
} catch(error) {
  console.error('Provisioning stopped:',error.code || error.name,error.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));
  process.exitCode=1;
} finally { await pool.end(); }
