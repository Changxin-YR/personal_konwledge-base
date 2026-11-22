export type OutlineNode={id:string;parent_id:string|null;order_key:number;body:string;body_revision:number}
export type Placement={id:string;parent_id:string;order_key:number;archived:boolean}
export type OutlineAction=
  | {action:'add';parent_id:string;body:string}
  | {action:'edit';node_id:string;body:string}
  | {action:'move';node_id:string;parent_id:string;index:number}
  | {action:'delete';node_id:string;mode:'subtree'|'promote';preview_token:string}
  | {action:'undo'}

export const outlineLimit=256

export class Outline {
  readonly byId:Map<string,OutlineNode>
  private readonly byParent=new Map<string,OutlineNode[]>()

  constructor(nodes:OutlineNode[]){
    this.byId=new Map(nodes.map(n=>[n.id,n]))
    for(const n of nodes){
      if(n.parent_id===null)continue
      const siblings=this.byParent.get(n.parent_id)??[]
      siblings.push(n);this.byParent.set(n.parent_id,siblings)
    }
    for(const list of this.byParent.values())list.sort((a,b)=>a.order_key-b.order_key)
  }

  children(id:string){return this.byParent.get(id)??[]}

  descendants(id:string){
    const out:OutlineNode[]=[],stack=[...this.children(id)].reverse(),seen=new Set([id])
    while(stack.length){
      const n=stack.pop()!
      if(seen.has(n.id))throw new Error('Outline has a cycle')
      seen.add(n.id);out.push(n);stack.push(...[...this.children(n.id)].reverse())
    }
    return out
  }

  private slots(parent:string,nodes:OutlineNode[]):Placement[]{
    return nodes.flatMap((n,order_key)=>n.parent_id===parent&&n.order_key===order_key?[]:
      [{id:n.id,parent_id:parent,order_key,archived:false}])
  }

  move(id:string,parent:string,index:number):Placement[]|undefined{
    const n=this.byId.get(id),target=this.byId.get(parent)
    if(!n?.parent_id||!target||id===parent||this.descendants(id).some(x=>x.id===parent))return
    const destination=this.children(parent).filter(x=>x.id!==id)
    if(!Number.isSafeInteger(index)||index<0||index>destination.length)return
    destination.splice(index,0,n)
    const source=n.parent_id===parent?[]:this.slots(n.parent_id,this.children(n.parent_id).filter(x=>x.id!==id))
    return [...this.slots(parent,destination),...source]
  }

  remove(id:string,mode:'subtree'|'promote'):Placement[]|undefined{
    const n=this.byId.get(id)
    if(!n?.parent_id)return
    const kept=this.children(n.parent_id).flatMap(x=>x.id===id?(mode==='promote'?this.children(id):[]):[x])
    const removed=mode==='subtree'?[n,...this.descendants(id)]:[n]
    return [...this.slots(n.parent_id,kept),...removed.map(x=>({id:x.id,parent_id:x.parent_id!,order_key:x.order_key,archived:true}))]
  }
}
