// Shared by the website and the offline editor. Transport is injected.
export function mountPoll(card, request, signal) {
  const preview=card.dataset.pollPreview==='true';
  const form=card.querySelector('form'),button=card.querySelector('.poll-submit');
  const status=card.querySelector('.poll-status'),fieldset=card.querySelector('fieldset');
  const rows=[...card.querySelectorAll('[data-option]')];
  let ready=false,busy=false,voted=false;
  function render(data) {
    ready=true;voted=data.voted;fieldset.disabled=voted;button.hidden=voted;
    if(!voted){status.textContent=preview?'离线预览 · 不记录真实投票':'投票后查看比例 · 同一身份仅可投一次';return;}
    card.classList.add('is-voted');
    for(const row of rows) {
      const id=row.dataset.option,percent=data.total?Math.round((data.counts[id]||0)/data.total*100):0;
      row.style.setProperty('--vote-ratio',String(percent/100));
      row.querySelector('input').checked=id===data.choice;
      row.classList.toggle('is-selected',id===data.choice);
      row.classList.toggle('is-correct',id===data.answer);
      row.querySelector('.poll-result').textContent=`${id===data.choice?'已选 · ':''}${id===data.answer?'正确 · ':''}${percent}%`;
    }
    status.textContent=`${preview?'模拟结果 · ':''}${data.total} 人参与 · 已投票${data.answer?(data.choice===data.answer?' · 回答正确':' · 正确选项已标记'):''}`;
    if(data.answer && data.explanation){const el=card.querySelector('.poll-explanation');el.textContent=data.explanation;el.hidden=false;}
    if(rows.length===2){
      const comparison=card.querySelector('.poll-comparison');comparison.replaceChildren();comparison.hidden=false;
      const labels=document.createElement('div');labels.className='poll-duel-labels';
      const first=(data.counts[rows[0].dataset.option]||0)/data.total*100;
      rows.forEach((row,index)=>{const label=document.createElement('span');label.textContent=`${row.querySelector('.poll-label').textContent} · ${Math.round(index?100-first:first)}%`;labels.append(label);});
      const bar=document.createElement('div');bar.className='poll-duel-bar';bar.setAttribute('aria-hidden','true');
      const fill=document.createElement('span');fill.style.setProperty('--duel-ratio',String(first/100));bar.append(fill);comparison.append(labels,bar);
    }
  }
  async function load(option) {
    if(busy || signal.aborted)return;
    busy=true;button.disabled=true;fieldset.disabled=true;
    status.textContent=option?'正在提交…':'正在读取投票状态…';
    try {const data=await request(option);if(signal.aborted)return;render(data);}
    catch(error){if(!signal.aborted){status.textContent=error.message || '服务暂时不可用，请重试';button.textContent=ready?'重试提交':'重新连接';}}
    finally {busy=false;if(!signal.aborted){button.disabled=false;fieldset.disabled=!ready||voted;if(ready&&!voted)button.textContent=preview?'模拟选择':'提交选择';}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(!ready){void load();return;}const input=form.querySelector('input:checked');if(input&&!voted)void load(input.value);},{signal});
  void load();
}
