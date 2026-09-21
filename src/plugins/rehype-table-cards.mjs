export default function tableCards(){return tree=>{
  function walk(node){
    if(!node.children)return;
    node.children=node.children.map(child=>{
      walk(child);
      if(child.type==='element'&&child.tagName==='table')return {type:'element',tagName:'div',properties:{className:['article-table-card'],tabIndex:0,role:'region','aria-label':'表格，可横向滚动'},children:[child]};
      return child;
    });
  }walk(tree);
};}
