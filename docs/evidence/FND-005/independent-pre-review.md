# FND-005 独立预审：冻结前代码风险

日期：2026-11-18（Asia/Shanghai）。审查角色：独立测试/复核。依据：用户本次只读预审授权、`CODEX_START.md` 3.3.0 T01–T09 与 `independent-test-contract.md`。当前主实现尚未冻结，本报告不是最终验收，不授予任何 T 项 PASS，也不修改单元状态。

## 审查结论与证据性质

发现两项 P1 和三项 P2，均有当前源码路径及可执行复现；应在候选冻结前处理。缺真实 GPT 是独立的环境阻塞，不能掩盖以下已复现的代码缺陷。真实 GPT 的 T01/T02/T08 按用户报告仍为 BLOCKED，本角色未探测提供方或凭据；其余冻结候选独立验收保持 NOT_RUN。

本次只读取产品/测试代码，直接加载当前 `ai-service.ts` 和 `ai-page.ts` 运行无网络内存探针。AiService 探针使用内存 LLM、工具端口、对象端口替身；UI 探针使用 Node VM 与最小 DOM/fetch 替身。结果属于 `CONTROLLED_FIXTURE` 加 `STATIC`，不是固定 DSH 原生执行器、真实 HTTP/SQLite 或真实浏览器/GPT 的重验。没有启动 Host、修改数据库、调用真实模型或改动产品/测试脚本。唯一新增文件为本报告。

仓库 HEAD 为 `4282b9231a4ac38b0eb87145c337b811aec033e4`，分支 `codex/knowledgeos-fnd-005`；存在主线程正在修改的工作树，不把 HEAD 当实现候选。以下行号与哈希绑定本次读取的源码；写报告前复读确认五个文件仍是同一组哈希。

| 文件（`packages/knowledgeos-panel/src/host/` 下） | SHA-256 |
|---|---|
| `ai-service.ts` | `631ba703e1e0bd2d91cbec3dbed8dcfdeffd9732abd538252143d832f7098eb7` |
| `ai-http.ts` | `46987b16b2458ba19df4126a89516f290b380b4884e947122bde9722138de742` |
| `ai-tools.ts` | `4302faaa836d167f93045d5cce8fbbc9c161dd439b9d15b8c920114aa6bc9b0d` |
| `ai-page.ts` | `3658160e83bc52cfc6eb14558a4e9093e0ee4e5740d920c45b20b8e1fe57c0e6` |
| `storage.ts` | `06489cd188c6cef733ee0ea6230c9d4e501d481e6c028a0b14345d0de6d2d538` |

运行环境：Node `v24.22.0`，PowerShell；探针命令 `node --experimental-transform-types --input-type=module`，全部退出码 0。实验性类型转换警告不作为失败。命令与合成输出见后文，未写入额外脚本文件。

## 阻止冻结的问题

### R1 [P1] 原生工具完成后的等待窗口缺少发布前会话/读权限重验

位置：`ai-service.ts:159–166`，`ai-http.ts:33`；关联：`ai-tools.ts:43–45`、`storage.ts:915–918`。

`execute()` 只在注册的工具体开始时调用 `actorNow()`，随后等待整个 `tools.execute()`。批次返回后直接解析正文并返回 HTTP，没有再次核对原会话或目标当前 read 权限。固定上游 `packages/core/tools/src/pipeline.ts` 的 dispatch 包装和 `complete()`/`postExecute()` 都存在异步等待；“工具体已读出对象”与“业务结果发布”之间可以发生注销、成员资格过期或撤权。

复现时让工具体正常返回对象，在批次交还 AiService 前暂停；撤销读权限，或让 `actorNow()` 返回 undefined，再放行。实际仍返回 `READ` 和完整合成正文，探针两种情况均 `leaked:true`。这不涉及追讨已经合法送达客户端的内容：暂停发生在 HTTP 返回之前，数据尚未发布给请求者。写入/幂等重放同样返回完整对象，也经过这一发布窗口。

预期：发布受控正文前重新核验原会话、用户/service 绑定及当前 read ACL；不满足则返回安全认证/权限拒绝并丢弃待发布正文。若写入已经提交，保留事实与原回执供授权对账，不声称回滚；也不要通过重新读取当前对象替换幂等原结果。对应 T03/T04/T08、独立契约 D6。

### R2 [P1] 执行阶段取消不能中止尚未开始的写入

位置：`ai-service.ts:140–146,149–159`。

`execute()` 在进入原生执行器前把记录改成 `executing`；`cancel()` 遇到该状态只抛 `OPERATION_IN_PROGRESS`。执行没有保存可由取消端点触发的 AbortController，取消只影响 prepare 的模型请求。用户在原生 pre-execute/策略等待期间取消，虽然业务工具体还没开始，原始执行信号也不会被中止，放行后照常修改对象。

内存探针明确在工具体之前暂停，再调用 `cancel(actor, request_id)`。实际为 `cancelCode=OPERATION_IN_PROGRESS`、`callerSignalAborted=false`、`writes=1`、`finalCode=UPDATED`。这里不要求撤销已提交事务；问题是取消处理时还没有开始业务写入。页面在执行过程中也没有立即禁用其已启用的取消按钮，会真实触发这个分支。

预期：为活动执行维护与 request/session 绑定的中止控制，取消能够到达原生 `signal`，等待中的调用在开始副作用前退出。若已经提交，要给出已完成/待对账状态并保留回执，而不是把所有 executing 状态都视为不可取消。对应 T07 与独立契约取消边界。

### R3 [P2] 原生执行器的结构化取消/超时错误统一丢失为 TOOL_FAILED

位置：`ai-service.ts:13–15,160–167`；关联：`ai-http.ts:35–37`。

`ToolsPort` 没有保留 `ToolExecutionFailure.error.info.code`，`execute()` 对任何 `result.isError` 直接抛 `502 TOOL_FAILED`。固定上游原生执行器对开始前中止给出 `ABORTED_BEFORE_DISPATCH`，工具超时可给出 `TOOL_TIMEOUT`。这些原生错误不经过注册工具体里返回 `{ok:false,...}` 的分支，现有业务错误处理无法保留它们。

探针用固定上游同形的 `isError:true / error.info.code=ABORTED_BEFORE_DISPATCH` 批次结果直接驱动真实 AiService，实际为 `502 TOOL_FAILED`，写入数 0；正确结果应为取消类。工具超时等分类也会被同一分支丢弃，后续需要用真实原生执行器确认。不能靠只测试 prepare 的模型取消来覆盖这里。

预期：保留并按白名单映射原生结构化原因和执行阶段；取消、工具超时、权限拒绝、存储错误、内部协议错误分别处理。若在提交后才中止，要反映已提交/待对账事实，不盲目重新执行。对应 T07 的准确状态要求。

### R4 [P2] 提供方错误分类会把缺凭据当坏凭据，并让消息文字覆盖明确错误码

位置：`ai-service.ts:21–34`；参考：固定上游 `packages/llm/llm/src/error.ts` 的 `NO_CREDENTIAL_STORE`、`AUTH`、`QUOTA` 等结构化码。

实际调用 `modelFailure({code:'NO_CREDENTIAL_STORE'})` 得到 `CREDENTIALS_INVALID`，而缺凭据存储尚未发生“验证了错误凭据”，修复动作不同。另一个直接复现：`modelFailure({code:'AUTH',status:401,message:'quota read permission denied'})` 得到 `QUOTA_EXHAUSTED`，因为第 25 行的文本匹配优先于 AUTH/status 分类。包含 billing/balance 等字样的权限诊断也会被错误认为额度耗尽。问题是已有明确机器码仍被不稳定文本重分类，并非要求推测无法判断的提供方含义。

预期：优先使用固定上游明确码及结构化状态，缺存储/缺凭据与无效凭据分开；仅对缺少结构化信息的情况使用受限兼容规则，不能让普通文字覆盖明确 AUTH/permission 类。现有 fixture 把 missing/quota 填在 AUTH/RATE_LIMIT 的 message 中，验证的是特定文本启发式，尚未覆盖真正的 `MISSING_CREDENTIAL`、`NO_CREDENTIAL_STORE`、`QUOTA` 等固定码。对应 T07。

### R5 [P2] UI 取消后的迟到 prepare 响应会重新启用执行

位置：`ai-page.ts:9`（整段页面脚本）：prepare 的 `gen=generation` 与取消回调。

取消成功只设 `prepared=null`、禁用 execute，没有使当前 prepare 回调失效。若 prepare 响应在服务器形成后被网络延迟，取消响应先到，原 prepare 回调稍后仍通过 `gen===generation`，把状态改回“已准备”并启用 execute。服务器此时可能已经把该准备记录置为 failed/CANCELLED，所以 UI 又提供一个必失败的执行入口并覆盖终态。

运行页面生成器的原始内联脚本，用受控 fetch 先完成取消，再交付旧 prepare 响应，实际顺序：`已取消 → 已准备 · review-fixture / review-model`，`executeEnabled=true`。这是页面状态机复现；没有用 VM 替代浏览器兼容/真实 UI 验收。

预期：按请求身份/世代使已取消调用的迟到成功、错误和 finally 更新失效；之后允许发起新的独立请求。不要简单增加 generation 后遗漏 busy/按钮复位而造成永久禁用。对应 T08、独立契约“迟到结果不能恢复取消状态”。

## 本次未发现缺陷的关键路径与剩余验证

- `storage.ts:909–925` 在 `BEGIN IMMEDIATE` 后重新取时间，检查原 session/user/service/space 有效性，再查 edit/read ACL，再查作用域内持久回执；相同摘要先回放原 `result_json`，否则判版本后更新并插入回执。未看到本轮要求的“先版本冲突导致正确重放失败”“用最新对象重建旧结果”“改目标仍允许同键写入”或“edit 单独泄露正文”的静态缺陷。异常路径调用回滚。这是源码观察，锁竞争、迁移、故障回滚、跨进程并发仍待冻结后的真实 SQLite 验证。
- `toolArguments()` 独立拒绝多余/身份字段，并校验工具名、目标与补丁；摘要含工具、object_id、expected_revision、title、body。AiService 的 AsyncLocalStorage 绑定还核对 callId/name/参数摘要和当前 session/user/service，未发现允许模型自设 actor 或普通用户提升 owner 的路径。
- `ai-http.ts` 已做业务认证、请求体后再次认证、Host/Origin/Fetch-Metadata/专用请求头与请求体大小约束，执行会把 `actorNow` 传给工具体。R1 是等待后的发布缺口，不是这些入口检查不存在。
- 正常工具的 read/update 用例返回 `{ok:false,status,code}` 时，原生结果仍是 canonical success / `isError:false`；AiService 另外检查 `ok` 后才返回业务错误。预审没有把这一点单独当成安全绕过，但后续证据必须同时记录领域 `ok/code` 和原生 envelope，不能将原生 `isError:false` 当作业务 PASS。
- 当前未冻结；未复跑主线程 T03–07、迁移、实际 UI、真实原生取消/策略等待或生命周期检查。模型存在性/价格/用量配置、原始日志脱敏和实际加载产物绑定也不由本次内存探针证明。真实 GPT 缺失继续阻塞单元完成。

## 可执行复现 A：真实 AiService 源码、内存端口与确定性屏障

在仓库根 PowerShell 执行；只在内存构造合成对象，没有网络或数据库操作。`before`/`after` 分别模拟工具体前与工具体后、批次返回前的等待点，替身明确不是原生 DSH。

```powershell
@'
import { AiService, modelFailure } from './packages/knowledgeos-panel/src/host/ai-service.ts';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const actor={sessionId:'review-session',userId:'review-user',serviceId:'review-service',personalSpaceId:'review-space',role:'member'};
const setup=(hooks={})=>{
 const state={live:true,allowed:true,writes:0};
 const object={id:'review-object',title:'SYNTHETIC_TITLE',body:'SYNTHETIC_PRIVATE_SENTINEL',revision:1};
 const definitions=new Map();
 const store={authorizeObject:()=>state.allowed?{...object}:undefined,mutateObjectOnce:()=>{state.writes++;return {kind:'updated',object:{...object,revision:2}};}};
 const llm={listProviders:()=>[{id:'review-fixture'}],listModels:async()=>[{id:'review-model'}],async *stream(o){
  const raw=JSON.parse(o.messages[0].content[0].text),update=raw.instruction==='update';
  yield {type:'block-end',block:{type:'tool-call',id:'review-call',name:update?'knowledgeos_update_object':'knowledgeos_read_object',arguments:JSON.stringify({object_id:'review-object',...(update?{expected_revision:1,body:'SYNTHETIC_UPDATE'}:{})})}};
  yield {type:'finish',reason:{kind:'tool-calls'}};
 }};
 const tools={register:d=>{definitions.set(d.name,d);return()=>definitions.delete(d.name);},async execute(input){
  await hooks.before?.(input,state);
  if(hooks.errorCode)return {results:[{callId:input.calls[0].id,result:{isError:true,error:{message:'synthetic failure',info:{name:'AbortError',code:hooks.errorCode}},content:[{type:'text',text:'synthetic failure'}]}}]};
  const call=input.calls[0],definition=definitions.get(call.name);
  const value=await definition.execute(JSON.parse(call.arguments),{callId:call.id,name:call.name,signal:input.signal});
  await hooks.after?.(value,state);
  return {results:[{callId:call.id,result:{isError:false,content:definition.output.render({},value)}}]};
 }};
 const service=new AiService(store,{provider:'review-fixture',model:'review-model',inputUsdPerMillion:0,outputUsdPerMillion:0},llm,tools);
 const signal=new AbortController().signal;
 const prepare=instruction=>service.prepare(actor,{request_id:'review-request',instruction,object_id:'review-object',expected_revision:1,idempotency_key:'review-key'},signal);
 return {state,service,signal,prepare,now:()=>state.live?actor:undefined};
};
for(const invalidation of ['grant','session']){
 const reached=gate(),release=gate(),x=setup({after:async()=>{reached.resolve();await release.promise;}}),p=await x.prepare('read');
 const executing=x.service.execute(actor,x.now,p.prepared_id,x.signal);
 await reached.promise;
 if(invalidation==='grant')x.state.allowed=false;else x.state.live=false;
 release.resolve();
 try{const out=await executing;console.log(JSON.stringify({probe:'post-tool-publication-'+invalidation,code:out.result.code,leaked:out.result.object.body==='SYNTHETIC_PRIVATE_SENTINEL',session_live:x.state.live,acl_live:x.state.allowed}));}
 catch(e){console.log(JSON.stringify({probe:invalidation,code:e.code}));}
 finally{x.service.close();}
}
{
 const reached=gate(),release=gate(),x=setup({before:async()=>{reached.resolve();await release.promise;}}),p=await x.prepare('update');
 const executing=x.service.execute(actor,x.now,p.prepared_id,x.signal);
 await reached.promise;
 let cancelCode='OK';try{x.service.cancel(actor,'review-request');}catch(e){cancelCode=e.code;}
 release.resolve();const out=await executing;
 console.log(JSON.stringify({probe:'cancel-before-body',cancelCode,callerSignalAborted:x.signal.aborted,writes:x.state.writes,finalCode:out.result.code}));
 x.service.close();
}
{
 const x=setup({errorCode:'ABORTED_BEFORE_DISPATCH'}),p=await x.prepare('read');
 try{await x.service.execute(actor,x.now,p.prepared_id,x.signal);}
 catch(e){console.log(JSON.stringify({probe:'native-error-classification',nativeCode:'ABORTED_BEFORE_DISPATCH',actualStatus:e.status,actualCode:e.code,writes:x.state.writes}));}
 finally{x.service.close();}
}
console.log(JSON.stringify({probe:'provider-classification',missingStore:modelFailure({code:'NO_CREDENTIAL_STORE'}).code,structuredAuthWithQuotaText:modelFailure({code:'AUTH',status:401,message:'quota read permission denied'}).code}));
'@ | node --experimental-transform-types --input-type=module
```

本次分别执行同等源代码探针获得的实际输出（分类函数先单独执行，其余四行随后执行）：

```json
{"probe":"post-tool-publication-grant","code":"READ","leaked":true,"session_live":true,"acl_live":false}
{"probe":"post-tool-publication-session","code":"READ","leaked":true,"session_live":false,"acl_live":true}
{"probe":"cancel-before-body","cancelCode":"OPERATION_IN_PROGRESS","callerSignalAborted":false,"writes":1,"finalCode":"UPDATED"}
{"probe":"native-error-classification","nativeCode":"ABORTED_BEFORE_DISPATCH","actualStatus":502,"actualCode":"TOOL_FAILED","writes":0}
{"missingStore":"CREDENTIALS_INVALID","structuredAuthWithQuotaText":"QUOTA_EXHAUSTED"}
```

修复后应观察安全拒绝而不是 `leaked:true`，取消在工具体前已生效且 writes 为 0，原生取消返回取消类，结构化缺凭据/AUTH 保持正确类别。实际 Host 复测应通过正常账号登录、受控原生策略屏障及真实撤权/注销端点重现这些时序；保持结果类别诚实，不将本段端口替身当真实 HTTP/SQLite 证据。

## 可执行复现 B：原始页面脚本的迟到响应

```powershell
@'
import vm from 'node:vm';
import { buildAiHtml } from './packages/knowledgeos-panel/src/host/ai-page.ts';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const response=data=>({ok:true,status:200,json:async()=>({data})});
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',disabled:false,replaceChildren(){},append(){}});return nodes.get(id);};
const waiting=gate(),entered=gate();
const document={getElementById:node,createElement:()=>({}),addEventListener(){},visibilityState:'visible'};
const fetch=async(path,options)=>{
 if(path==='/knowledge/v1/me')return response({display_name:'Synthetic A',login_name:'review-a'});
 if(path==='/knowledge/v1/ai/status')return response({provider:'review-fixture',model:'review-model',configured:true,max_output_tokens:512,budget_usd:.1,attempts:0,max_calls:8});
 if(path==='/knowledge/v1/objects')return response([{id:'review-object',title:'Synthetic',revision:1}]);
 if(path==='/knowledge/v1/ai/prepare'){entered.resolve();return waiting.promise;}
 if(path==='/knowledge/v1/ai/cancel')return response({state:'cancelled'});
 throw new Error('unexpected synthetic route '+path);
};
vm.runInNewContext(buildAiHtml().match(/<script>([\s\S]*?)<\/script>/)[1],{document,fetch,crypto:{randomUUID:()=> 'synthetic-ui-request'},console});
for(let i=0;i<12;i++)await new Promise(setImmediate);
node('instruction').value='read';
const preparing=node('prepare').onclick();await entered.promise;
await node('cancel').onclick();const afterCancel=node('status').textContent;
waiting.resolve(response({prepared_id:'review-prepared',request_id:'synthetic-ui-request',tool:'knowledgeos_read_object',arguments:{object_id:'review-object'},provider:'review-fixture',model:'review-model'}));
await preparing;
console.log(JSON.stringify({probe:'ui-late-prepare-after-cancel',afterCancel,afterLateResponse:node('status').textContent,executeEnabled:!node('execute').disabled}));
'@ | node --experimental-transform-types --input-type=module
```

实际输出：

```json
{"probe":"ui-late-prepare-after-cancel","afterCancel":"已取消","afterLateResponse":"已准备 · review-fixture / review-model","executeEnabled":true}
```

修复后取消状态不能被这份旧响应覆盖，execute 必须保持不可执行；然后另测新请求能正常开始。后续真实浏览器验收仍为 NOT_RUN。

## 交回主线程

先关闭 R1–R5 并提供修复后的源码/测试证据，再冻结包含实际构建产物、测试脚本、配置与加载路径哈希的候选。独立角色届时按既定契约实际运行；本预审不冒充最终独立 PASS。缺真实 GPT 的阻塞单列，不用受控夹具解除，也不改写历史验收。
