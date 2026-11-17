export async function resolve(specifier,context,nextResolve){
 if(specifier==='@deepseek-ai/schemastery')return {url:'data:text/javascript,export default { object(value) { return value }, string() { return {} } }',shortCircuit:true};
 return nextResolve(specifier,context);
}
