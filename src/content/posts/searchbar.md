---
title: 动态搜索框和具体搜索逻辑实现
published: 2024-10-01
updated: 2024-11-29
description: 二编增加搜索逻辑的实现
image: ""
tags:
  - JavaScript
  - Markdown
  - 前端
category: 前端
draft: false
series: Tonks
---
做招新题的时候遇到了一些很有意思的样例，分享一些心得。

## 前端搜索框实现：

#### 	#html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>动态搜索栏</title>
</head>
<body>
    <div class="searchBar" id="searchBar">
        <input type="text" class="input" id='input'>
        <a href="#" class="img" id='img'>
            <img src="搜索框.png" style="width: 30px;">
        </a>
        <div class="results" id="results"></div>
    </div>
</body>
</html>
```

#### 	#css

```css
.searchBar{
    position:absolute;
    transform: translate(-50%,-50%);/*将元素移动到父元素的中心*/
    background-color:#000000;
    height:40px;
    border-radius:40px;
    padding:10px;
    width: 40px;
    top: 50%;
    left: 50%;
}
.input{
    border:none;
    background:none;
    outline:none;
    
    width:0;
    padding:0;
    line-height:40px;
    font-size:20px;
    color:wheat;
}
.img{
    color:red;
    float:right;/*把控不好位置，最后发现一个float就搞定了*/
    border-radius: 50%;
    background-color: #000000;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: 0.4s;
    width: 40px;
    height: 40px;
}
.addfocus{
    width: 200px;
    padding: 0 6px;
    transition: 1s;
}
.addfocusInput{/*解决了图片换行的问题*/
    width: 140px;
    padding: 0 6px;
    transition: 1s;
}
.nofocus{/*保证与初始状态一致*/
    width: 40px;
    padding: 10px;
    transition: 1s;
}
.nofocusInput{
    width: 0;
    padding: 0;
    transition: 1s;
}
.results {
    margin-top: 20px;
    color: #000000;
}
```

#### 	#js.1

```javascript
const input = document.querySelector('.input')
const search = document.querySelector('.searchBar')
const img = document.querySelector('.img')
img.addEventListener('mouseenter',()=>{           
	input.classList.add('addfocusInput');
	search.classList.add('addfocus');
	input.classList.remove('nofocusInput');
	search.classList.remove('nofocus');
})
img.addEventListener('click',()=>{
	input.classList.add('nofocusInput');
	search.classList.add('nofocus');
	input.classList.remove('addfocusInput');
	search.classList.remove('addfocus');
})
```

​	由于初始状态只能看见img，故采用这种形式。

​	**主要实现逻辑为：鼠标移动到搜索图标内，搜索框展开，再次点击搜索图标，搜索框合上。**

##### 	<font color= red>**为什么不使用hover？**</font>

​	使用hover的话，实现逻辑就更加清晰，而且根本不需要js部分，代码看上去也更加简洁。**然而我在实际测试时，发现中文输入会导致丢失hover属性，导致搜索栏意外折叠，虽然能输入，但是观感很不好。**

​	我测试时使用微软拼音输入法。由于我没有测试更多的输入法，感兴趣的可以测试一下使用hover来代替JavaScript事件监听时，自己输入中文时具体是什么效果。如果没有出现bug当然是最好的。

​	但我仍然建议使用js监听，因为大型项目或者个人网站是要给别人看的，当然要选择普适性最好、照顾大部分用户体验的方案。

##### 	<font color= red>**为什么会丢失hover？**</font>

​	在使用中文输入法的时候，尤其是使用拼音输入时会出现这个情况。我的情况是**输入法界面干扰**：拼音输入时，汉字选择框虽然是贴在文字下方的，但是其实际体积要大一点——约为半个字母的高度，这时鼠标如果在这个范围里，模块就会因为覆盖而失去hover。

## 简单搜索逻辑：

#### 		#js.2

```js
document.getElementById('searchBar').addEventListener('mouseenter', function() {
    const inputtxt = document.getElementById('input').value;
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';
    const data = ['每日一题','学习笔记','问题解决'];//数据源

if(inputtxt){//否则会出现很可怕的后果，不信可以删去这个if！
    const results = data.filter(item => item.includes(inputtxt));
    if (results.length > 0) {
        results.forEach(item => {
            const p = document.createElement('p');
            p.textContent = item;
            resultsDiv.appendChild(p);
        });
    } else {
        resultsDiv.textContent = '没有结果';
    }
}
});

```

​	实现逻辑：鼠标进入时清空result里的内容，通过检查inputtxt是否有值来判断要不要显示result。如果有input，则过滤数据，并判断result长度，如果大于0则显示，等于0则显示“没有结果”。

​	**实际应用时请加上超链接！**
