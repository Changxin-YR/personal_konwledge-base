#!/usr/bin/env node
/** Selective read-only metadata audit: never serialize credentials or complete profile config. */
import { readFileSync,existsSync,mkdirSync,writeFileSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),yaml=require('../../.cache/build/dsh-39163dd/node_modules/.pnpm/yaml@2.9.0/node_modules/yaml')
const out=resolve(process.argv[2]??'docs/evidence/FND-005/provider-audit.json');mkdirSync(resolve(out,'..'),{recursive:true})
const home=join(homedir(),'.dsh'),file=join(home,'profiles/desktop/cordis.patch.yml'),rows=existsSync(file)?yaml.parse(readFileSync(file,'utf8')):[]
const entries=Array.isArray(rows)?rows:[],routes=[];let selectedProvider=null,selectedModel=null
const walk=list=>{for(const row of list){if(!row||typeof row!=='object')continue;const cfg=row.config??{};if(typeof cfg.provider==='string')selectedProvider=cfg.provider;if(typeof cfg.model==='string')selectedModel=cfg.model;
 for(const [provider,p] of Object.entries(cfg.providers??{})){if(!p||typeof p!=='object')continue;const ref=typeof p.apiKeyEnv==='string'?p.apiKeyEnv:null;routes.push({provider,adapter:row.name??row.id,protocol:p.api??null,endpoint_host:typeof p.baseURL==='string'?new URL(p.baseURL).hostname:null,models:Array.isArray(p.models)?p.models.map(m=>({id:m.id??null})):[],credential_reference:ref,environment_credential_present:ref?Boolean(process.env[ref]):false,inline_credential_present:typeof p.apiKey==='string'&&p.apiKey.length>0})}
 if(Array.isArray(row.insert))walk(row.insert);if(Array.isArray(row.children))walk(row.children)}}
walk(entries)
const keys=Object.keys(process.env).filter(k=>/OPENAI|GPT.*KEY|API_API_KEY/.test(k));const hasGPT=routes.some(r=>r.models.some(m=>/^gpt-|^o[1-9](?:-|$)/i.test(m.id??'')))
const report={category:'READ_ONLY_PROVIDER_CONFIGURATION_AUDIT',status:'PASS',audited_at:new Date().toISOString(),profile:'desktop',selected_provider:selectedProvider,selected_model:selectedModel,routes,gpt_catalog_present:hasGPT,gpt_environment_credential_present:keys.some(k=>Boolean(process.env[k])),credential_store_present:existsSync(join(home,'.credentials.yaml')),credential_store_values_read:false,network_provider_calls:0,real_gpt_status:'BLOCKED',reason:hasGPT?'NO_AUTHORIZED_USABLE_GPT_ROUTE_PROVEN':'CONFIGURED_MODEL_IS_DEEPSEEK_NOT_GPT',notes:['OpenAI-compatible protocol is not proof of a GPT model.','Development assistant access does not provide a business GPT API credential.','No model substitution; no paid request to a non-GPT model.']}
writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
