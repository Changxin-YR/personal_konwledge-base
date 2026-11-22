export function buildProjectTaskHtml(nonce: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>项目协作 · KnowledgeOS</title>
<style nonce="${nonce}">
:root{color:#243934;background:#f5f8f7;font:15px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}header{border-bottom:1px solid #cddbd6;background:#fff}nav,main{max-width:1200px;margin:auto;padding:12px 24px}nav,.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}nav strong,a{color:#195a4e}h1{font-size:25px;margin:6px 0}h2{font-size:17px;margin:0 0 8px}h3{font-size:15px;margin:0 0 6px}p{margin:0 0 8px}section{border-top:1px solid #cddbd6;padding:14px 0}#status{min-height:24px;color:#40564f}.workspace{display:grid;grid-template-columns:minmax(190px,265px) minmax(0,1fr);gap:24px}.side{border-right:1px solid #cddbd6;padding-right:16px}.side,#content,label,input,select,textarea{min-width:0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px}.wide{grid-column:1/-1}label{display:grid;gap:3px}input,select,textarea,button{font:inherit;color:inherit;background:#fff;border:1px solid #aabfb6;border-radius:5px;padding:6px 8px;max-width:100%}textarea{resize:vertical;min-height:68px}button{cursor:pointer;text-align:left}button:disabled{opacity:.6;cursor:default}button:focus-visible,a:focus-visible,textarea:focus-visible{outline:2px solid #177c84;outline-offset:2px}button[aria-current=true]{background:#dfede8;border-color:#638e80}.primary{color:white;background:#225e51;border-color:#225e51}.quiet{color:#526a60}.danger{color:#8a382b}ul{padding:0;list-style:none;margin:5px 0}li{margin-bottom:4px;overflow-wrap:anywhere}.selector button{width:100%;overflow-wrap:anywhere}.member{display:flex;align-items:center;justify-content:space-between;gap:8px}.member button{flex-shrink:0}.criteria{display:grid;grid-template-columns:minmax(0,1fr) minmax(62px,96px) auto;align-items:end;gap:8px}.history{padding:10px 0;border-top:1px solid #d6e2dc}ol{padding-left:22px;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 15px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}dialog{max-width:min(420px,92vw);border:1px solid #9db4aa;border-radius:6px;background:#fff;color:inherit}dialog::backdrop{background:#182a2660}
#workflow{margin:14px 0;overflow-wrap:anywhere}.attempt-body,.review-evidence{white-space:pre-wrap}.checkline{display:flex;align-items:center;gap:8px}.checkline input{width:auto}.review-item{margin:8px 0;padding:8px 0;border-top:1px solid #d6e2dc}
@media(max-width:680px){nav,main{padding-inline:13px}.workspace,.fields{grid-template-columns:minmax(0,1fr);gap:8px}.side{border:0;padding-right:0}}
</style></head><body><header><nav aria-label="业务导航"><strong>KnowledgeOS</strong><a href="/knowledgeos/library">知识库</a><a href="/knowledgeos/projects" aria-current="page">项目协作</a><a href="/knowledgeos/invitations">邀请码</a><a href="/knowledgeos/account">账号</a></nav></header>
<main><h1>项目协作</h1><p id="status" role="status">正在读取…</p><a id="login" href="/knowledgeos/account" hidden>登录</a><div id="workspace" class="workspace" hidden>
<aside class="side"><h2>工作范围</h2><ul id="projects" class="selector"></ul><section><h2>新建项目</h2><form id="new-project"><label>项目名称<input id="name" maxlength="200" required></label><button type="submit" class="primary">创建项目</button></form></section></aside>
<div id="content"><h2 id="scope-title">个人任务</h2><section id="membership" hidden><div class="row"><h2>当前成员</h2><a id="invite" href="/knowledgeos/invitations" hidden>管理邀请</a></div><ul id="members"></ul></section>
<section id="dispatch"><h2>派发任务</h2><form id="task-form"><div class="fields"><label class="wide">标题<input id="title" maxlength="160" required></label><label class="wide">目标<textarea id="goal" maxlength="4000" required></textarea></label>
<label>截止时间（本地时间）<input id="due" type="datetime-local" required></label><label id="assignee-label">负责人<select id="assignee"></select></label><label id="reviewer-label">终审人<select id="reviewer"></select></label><label id="peer-label">同伴预审（可选）<select id="peer"></select></label>
<div class="wide"><h3>验收标准</h3><ul id="criteria"></ul><button type="button" id="add-criterion">添加标准</button></div></div><button type="submit" class="primary">发布任务</button></form></section>
<section><h2>任务列表</h2><ul id="tasks" class="selector"></ul></section>
<section id="task-detail" hidden><h2 id="task-title"></h2><dl id="task-facts"></dl><h3>标准历史</h3><div id="history"></div><button type="button" id="revise" hidden>修改标准</button>
<form id="revision-form" hidden><h3>新版本验收标准</h3><ul id="revision-criteria"></ul><div class="row"><button type="button" id="add-revision-criterion">添加标准</button><button type="submit" class="primary">保存新版本</button><button type="button" id="cancel-revise">取消</button></div></form>
<div id="workflow" hidden><h3>提交与审核</h3><div id="attempts"></div><div id="workflow-action"></div></div></section></div></div>
<dialog id="remove-dialog"><form method="dialog"><h2>移除项目成员</h2><p id="removal-name"></p><div class="row"><button value="cancel">取消</button><button value="remove" class="danger" id="remove-confirm">确认移除</button></div></form></dialog></main>
<script nonce="${nonce}">
'use strict';
const $=id=>document.getElementById(id), api='/knowledge/v1/project-tasks', mark={'content-type':'application/json','x-knowledgeos-request':'1'};
const labels={NOT_FOUND:'当前账号无权访问，或记录已失效。',AUTH_REQUIRED:'请登录。',ACTOR_MISMATCH:'账号已变更。',TASK_MEMBER_UNAVAILABLE:'负责人或审核人已不在项目中。',TASK_REVIEW_POLICY_REJECTED:'审核人必须符合当前审核路径，并且不同于负责人。',TASK_REVISION_CONFLICT:'任务标准已更新，请重新打开查看。',INVALID_TASK_DUE:'请选择未来的截止时间。',INVALID_TASK_INPUT:'检查必填项、标准和权重。',TASK_REQUEST_CONFLICT:'之前的派发请求结果未确定，请重新读取任务列表。'};
const kinds={personal:'个人任务',project_admin:'管理员终审',project_collaboration:'指定审核'};
const states={assigned:'已派发',in_progress:'进行中',submitted:'待审核',awaiting_admin_review:'待管理员终审',returned:'已退回',accepted:'已完成',failed:'未通过',blocked_pending:'待确认受阻',blocked:'受阻',awaiting_material_access:'待材料授权'};
const verdicts={pass:'通过预审',accept:'终审通过',return:'退回',fail:'终审未通过'};
labels.TASK_REVISION_CONFLICT='任务已更新，请重新打开查看。';labels.TASK_SUBMISSION_CONFLICT='提交版本已变更，请重新打开任务。';
labels.TASK_STATE_CONFLICT='当前任务状态不允许此操作。';labels.TASK_REQUEST_CONFLICT='原操作结果未确定，请保留本次内容重试或重新读取。';
let actor,scope=null,project,projectRows=[],tasks=[],task,removeTarget,busy=false,epoch=0,controller=new AbortController(),pendingAssign,pendingWorkflow;
const status=s=>$('status').textContent=s;
const get=(k)=>$(k).value;
function clearWorkflow(){$('workflow').hidden=true;$('attempts').replaceChildren();$('workflow-action').replaceChildren();}
function protect(){epoch++;controller.abort();controller=new AbortController();busy=false;actor=project=task=removeTarget=pendingAssign=undefined;tasks=[];projectRows=[];$('workspace').hidden=$('task-detail').hidden=$('membership').hidden=$('revision-form').hidden=true;
 pendingWorkflow=undefined;clearWorkflow();if($('remove-dialog').open)$('remove-dialog').close();for(const id of ['projects','members','tasks','history','task-title','task-facts','scope-title','removal-name','assignee','reviewer','peer'])$(id).replaceChildren();$('new-project').reset();$('task-form').reset();$('revision-criteria').replaceChildren();criterionRows('criteria',[]);}
async function request(endpoint,method='GET',data,key){const check=epoch;const response=await fetch(endpoint,{method,cache:'no-store',redirect:'error',signal:controller.signal,
 headers:method==='GET'?{}:{...mark,...(key?{'idempotency-key':key}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await response.json();if(check!==epoch)throw Error('STALE');if(response.status===401||result.code==='ACTOR_MISMATCH'||(actor&&result.data?.actor_id&&result.data.actor_id!==actor)){
  protect();status('请重新登录。');$('login').hidden=false;throw Error('STALE');}
 if(!response.ok)throw Error(result.code);return result.data;}
async function operation(work){if(busy)return;busy=true;const check=epoch;
 try{await work();}catch(e){if(check===epoch){if(e.message==='NOT_FOUND')protect();status(labels[e.message]||'暂时无法完成，请重新读取。');}}finally{if(check===epoch)busy=false;}}
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function button(text,fn){const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;}
function listItem(ul,b){const li=el('li');li.append(b);$(ul).append(li);return li;}
function option(id,text){const node=el('option',text);node.value=id;return node;}
function showProjects(){const personal=button('个人任务',()=>void operation(()=>choose(null)));if(scope===null)personal.setAttribute('aria-current','true');$('projects').replaceChildren();listItem('projects',personal);
 for(const p of projectRows){const b=button(p.name,()=>void operation(()=>choose(p.id)));if(scope===p.id)b.setAttribute('aria-current','true');listItem('projects',b);}}
function showTasks(){ const ul=$('tasks');ul.replaceChildren();if(!tasks.length)ul.append(el('li','没有任务'));
 for(const t of tasks){const b=button(t.title,()=>void operation(()=>openTask(t.id)));if(t.id===task?.id)b.setAttribute('aria-current','true');listItem('tasks',b);}}
function setOptions(id,people,placeholder,preferred){const node=$(id);node.replaceChildren(option('',placeholder),...people.map(p=>option(p.id,p.display_name)));if(people.some(p=>p.id===preferred))node.value=preferred;}
function scopeView(){const p=project;const manage=Boolean(p?.can_manage);const people=p?.members??[];const isAdmin=people.some(m=>m.id===actor&&m.role==='admin');
 $('scope-title').textContent=p?.name??'个人任务';$('membership').hidden=!p;$('invite').hidden=!manage;$('dispatch').hidden=Boolean(p&&!manage);$('members').replaceChildren();
 for(const member of people){const li=el('li');li.className='member';li.append(el('span',member.display_name+(member.id===p.owner_id?' · 项目所有者':member.role==='admin'?' · 管理员':'')));
  if(manage&&member.id!==p.owner_id)li.append(button('移除',()=>{if(busy)return;removeTarget=member.id;$('removal-name').textContent=member.display_name;$('remove-dialog').showModal();}));$('members').append(li);}
 for(const id of ['assignee','reviewer','peer'])$(id+'-label').hidden=!p;( $('peer-label')).hidden=!p||!isAdmin;
 setOptions('assignee',people,'请选择');setOptions('reviewer',isAdmin?people.filter(m=>m.role==='admin'):people,'请选择',isAdmin?actor:undefined);setOptions('peer',people,'无');
 showProjects();showTasks();}
async function choose(id){const next=id? (await request(api+'/projects/'+id+'/members')).project:undefined;
 const loaded=(await request(api+(id?'?project_id='+id:''))).tasks;
 if(scope!==id){$('task-form').reset();criterionRows('criteria',[]);pendingAssign=pendingWorkflow=undefined;}scope=id;project=next;tasks=loaded;task=undefined;clearWorkflow();$('task-detail').hidden=true;scopeView();$('workspace').hidden=false;status('');}
async function refresh(){const data=await request(api+'/projects');actor=data.actor_id;projectRows=data.projects;$('login').hidden=true;
 const preferred=scope&&projectRows.some(p=>p.id===scope)?scope:null;await choose(preferred);}
function addCriterion(list,value={description:'',weight:1}){if($(list).children.length>=20)return;const li=el('li');li.className='criteria';
 const dl=el('label','标准'),desc=el('input');desc.required=true;desc.maxLength=1000;desc.value=value.description;dl.append(desc);
 const wl=el('label','权重'),weight=el('input');weight.type='number';weight.required=true;weight.min='1';weight.max='100';weight.value=String(value.weight);wl.append(weight);
 const b=button('删除',()=>{if($(list).children.length>1)li.remove();});li.append(dl,wl,b);$(list).append(li);}
function criterionRows(list,items){$(list).replaceChildren();for(const item of items.length?items:[undefined])addCriterion(list,item);}
const criteria=list=>({items:[...$(list).children].map(row=>{const [d,w]=row.querySelectorAll('input');return {description:d.value,weight:Number(w.value)};}),submission_rule:'next_submission'});
const name=id=>project?.members.find(p=>p.id===id)?.display_name??(id===actor?'本人':'待核验');
const date=at=>new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(at));
async function openTask(id){const response=await request(api+'/'+id),t=response.task;
 const timeline=t.task_kind==='personal'?null:await request(api+'/'+id+'/history');
 if(timeline&&timeline.task_revision!==t.revision){clearWorkflow();$('task-detail').hidden=true;throw Error('TASK_REVISION_CONFLICT');}
 task=t;
 $('task-title').textContent=t.title;$('task-facts').replaceChildren();
 const shownState=t.state==='submitted'&&t.peer_reviewer_id?'待同伴预审':t.state==='submitted'&&t.task_kind==='project_admin'?'待管理员终审':states[t.state]??t.state;
 for(const [key,value] of [['目标',t.goal],['截止时间',date(t.due_at)],['状态',shownState],['负责人',name(t.assignee_id)],['下一处理人',t.next_actor_id?name(t.next_actor_id):'无'],['审核路径',kinds[t.task_kind]],['终审人',name(t.final_reviewer_id)],['同伴预审',t.peer_reviewer_id?name(t.peer_reviewer_id):'无']])$('task-facts').append(el('dt',key),el('dd',value));
 $('history').replaceChildren();for(const version of t.criteria_history){const row=el('div');row.className='history';row.append(el('strong','第 '+version.version+' 版'+(t.criteria_revision===version.version?' · 适用下次提交':' · 历史版本')));const ul=el('ol');for(const item of version.items)ul.append(el('li',item.description+' · 权重 '+item.weight));row.append(ul);$('history').append(row);}
 $('revise').hidden=t.issuer_id!==actor||!['assigned','returned'].includes(t.state);$('revision-form').hidden=true;renderWorkflow(t,timeline);$('task-detail').hidden=false;showTasks();}
function control(label,kind,max){const wrap=el('label',label),input=el(kind);input.required=true;input.maxLength=max;wrap.append(input);return [wrap,input];}
async function workflowWrite(t,suffix,draft,done){
 const path=api+'/'+t.id+'/'+suffix,digest=JSON.stringify([path,draft]);
 if(pendingWorkflow?.id===t.id&&pendingWorkflow.digest!==digest)throw Error('TASK_REQUEST_CONFLICT');
 if(!pendingWorkflow||pendingWorkflow.id!==t.id)pendingWorkflow={id:t.id,digest,key:crypto.randomUUID()};
 try{await request(path,'POST',draft,pendingWorkflow.key);}catch(e){if(labels[e.message]&&e.message!=='TASK_REQUEST_CONFLICT')pendingWorkflow=undefined;throw e;}
 pendingWorkflow=undefined;await openTask(t.id);status(done);
}
function renderWorkflow(t,timeline){clearWorkflow();if(!timeline)return;
 $('workflow').hidden=false;const attempts=$('attempts'),actions=$('workflow-action'),current=timeline.submissions.at(-1);
 if(!current)attempts.append(el('p','暂无提交'));
 for(const attempt of [...timeline.submissions].reverse()){
  const row=el('article');row.className='history';row.append(el('h3','提交第 '+attempt.version+' 版 · 标准第 '+attempt.criteria_version+' 版'),el('p',date(attempt.submitted_at)+' · '+(attempt.timing==='on_time'?'按期提交':'逾期提交')));
  const content=el('p',attempt.content);content.className='attempt-body';row.append(content);
  for(const decision of timeline.reviews.filter(r=>r.submission_id===attempt.id)){
   const block=el('div');block.className='review-item';block.append(el('strong',(decision.stage==='peer'?'同伴预审':'管理员终审')+' · '+verdicts[decision.verdict]),el('p',name(decision.reviewer_id)+' · '+date(decision.decided_at)),el('p',decision.reason));
   if(decision.requested_work)block.append(el('p','需补充：'+decision.requested_work));
   const items=el('ol'),standard=t.criteria_history.find(v=>v.version===attempt.criteria_version);
   for(const r of decision.criteria_results){const item=el('li',(standard?.items[r.criterion-1]?.description??'标准 '+r.criterion)+' · '+(r.met?'达标':'未达标')+'：'+r.evidence);item.className='review-evidence';items.append(item);}
   block.append(items);row.append(block);
  }
  attempts.append(row);
 }
 const form=el('form'),send=el('button');send.className='primary';send.type='submit';
 if(t.assignee_id===actor&&['assigned','in_progress','returned'].includes(t.state)){
  const [wrap,input]=control('提交内容','textarea',16000);input.id='submission-content';send.textContent=t.state==='returned'?'重新提交':'提交成果';form.append(wrap,send);
  form.onsubmit=e=>{e.preventDefault();void operation(()=>workflowWrite(t,'submissions',{actor_id:actor,expected_revision:t.revision,content:input.value},'成果已提交。'));};actions.append(form);return;
 }
 const peer=t.task_kind==='project_admin'&&t.state==='submitted'&&t.peer_reviewer_id===actor;
 const admin=t.task_kind==='project_admin'&&t.final_reviewer_id===actor&&project?.members.some(m=>m.id===actor&&m.role==='admin')&&
  (t.state==='awaiting_admin_review'||t.state==='submitted'&&!t.peer_reviewer_id);
 if(!current||!peer&&!admin)return;
 const standard=t.criteria_history.find(v=>v.version===current.criteria_version);if(!standard)return;
 const options=el('select');options.id='review-verdict';const selectLabel=el('label',peer?'预审结论':'终审结论');selectLabel.append(options);
 for(const [id,name] of peer?[['peer_pass','通过预审'],['peer_return','退回']]:[['final_accept','通过终审'],['final_return','退回'],['final_fail','终审未通过']])options.append(option(id,name));
 form.append(selectLabel);
 const inputs=standard.items.map((item,index)=>{
  const label=el('label',item.description+' · 权重 '+item.weight),check=el('input');check.type='checkbox';label.className='checkline';label.prepend(check);
  const [wrap,proof]=control('标准 '+(index+1)+' 依据','textarea',1000);const row=el('div');row.className='review-item';row.append(label,wrap);form.append(row);return [check,proof];
 });
 const [why,reason]=control('审核理由','textarea',4000),[more,work]=control('需补充内容','textarea',4000);
 const selection=()=>{const returned=options.value.endsWith('_return');more.hidden=!returned;work.required=returned;};options.onchange=selection;selection();
 send.textContent=peer?'保存预审':'保存终审';form.append(why,more,send);
 form.onsubmit=e=>{e.preventDefault();void operation(()=>workflowWrite(t,'reviews',{actor_id:actor,expected_revision:t.revision,submission_id:current.id,action:options.value,
  results:inputs.map(([check,proof],i)=>({criterion:i+1,met:check.checked,evidence:proof.value})),reason:reason.value,...(work.required?{requested_work:work.value}:{})},peer?'预审已保存。':'终审已保存。'));};actions.append(form);
}
$('new-project').addEventListener('submit',e=>{e.preventDefault();void operation(async()=>{
 const data=await request('/knowledge/v1/projects','POST',{name:get('name').trim()});$('new-project').reset();scope=data.id;await refresh();status('项目已创建。');});});
$('task-form').addEventListener('submit',e=>{e.preventDefault();void operation(async()=>{
 const draft={actor_id:actor,project_id:scope,title:get('title'),goal:get('goal'),due_at:new Date(get('due')).toISOString(),assignee_id:scope?get('assignee'):actor,
 final_reviewer_id:scope?get('reviewer'):actor,criteria:criteria('criteria')};if(scope&&!$('peer-label').hidden&&get('peer'))draft.peer_reviewer_id=get('peer');
 const digest=JSON.stringify(draft);if(pendingAssign&&pendingAssign.digest!==digest)throw Error('TASK_REQUEST_CONFLICT');
 if(!pendingAssign)pendingAssign={digest,key:crypto.randomUUID()};let result;
 try{result=await request(api,'POST',draft,pendingAssign.key);}catch(error){if(labels[error.message]&&error.message!=='TASK_REQUEST_CONFLICT')pendingAssign=undefined;throw error;}
 pendingAssign=undefined;$('task-form').reset();criterionRows('criteria',[]);await choose(scope);await openTask(result.task.id);status('任务已派发。');});});
$('add-criterion').onclick=()=>addCriterion('criteria');$('add-revision-criterion').onclick=()=>addCriterion('revision-criteria');
$('revise').onclick=()=>{if(!task)return;criterionRows('revision-criteria',task.criteria_history.at(-1).items);$('revision-form').hidden=false;};$('cancel-revise').onclick=()=>{$('revision-form').hidden=true;};
$('revision-form').addEventListener('submit',e=>{e.preventDefault();void operation(async()=>{
 const id=task.id;await request(api+'/'+id,'PATCH',{actor_id:actor,expected_revision:task.revision,criteria:criteria('revision-criteria')});
 await openTask(id);status('验收标准已保存。');});});
$('remove-dialog').addEventListener('close',()=>{const member=removeTarget;if($('remove-dialog').returnValue==='remove'&&member){void operation(async()=>{
 await request(api+'/projects/'+scope+'/members','POST',{actor_id:actor,remove_member_id:member});await choose(scope);status('项目成员已移除。');});}removeTarget=undefined;});
addEventListener('pagehide',protect);addEventListener('pageshow',()=>void operation(refresh));
let hidden=false;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hidden=true;protect();}else if(hidden){hidden=false;void operation(refresh);}});
// An open foreground tab must not retain project text after a remote revocation.
let checking=false;
setInterval(async()=>{
 if(checking||!actor||hidden||$('workspace').hidden)return;
 const identity=actor,checkedScope=scope,checkedTask=task?.id,checkedEpoch=epoch;
 const current=()=>epoch===checkedEpoch&&actor===identity&&scope===checkedScope&&task?.id===checkedTask;
 const query=new URLSearchParams();if(checkedScope)query.set('project_id',checkedScope);if(checkedTask)query.set('task_id',checkedTask);
 checking=true;
 try{
  const result=await fetch(api+'/access?'+query,{cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2500)])});
  const value=result.ok?await result.json():null;
  if(current()&&(value?.data?.actor_id!==identity||value?.data?.allowed!==true))throw Error('ACCESS_REVOKED');
 }catch{if(current()){protect();scope=null;status('无法确认任务访问权限，已隐藏内容。');$('login').hidden=false;}}
 finally{checking=false;}
},3000);
</script></body></html>`
}
