---
title: 前端练习(二) · CSS+JS动画名片轮播图练习
published: 2024-11-02
pinned: false
description: 一个简单的前端轮播图动画练习.
tags:
  - Markdown
  - CSS
  - JavaScript
  - 前端
category: 学习笔记
draft: false
---
在b站上偶然看到了一个CSS+JS动画名片的轮播图，感觉很酷，研究了一下发现居然没有用到很多js，惊为天人。仔细研究之后发现**思路是全都利用transition添加过渡**！

#### #html

```html
    <div class="container">
        <div id="slide">
            <div class="item" style="background-image: url('cg(16).png');">
                <div class="content">
                    <div class="name">我是谁？</div>
					<div class="des">我是王雪</div>
                </div>
            </div>
            <div class="item" style="background-image: url('cg(17).png');">
                <div class="content">
                    <div class="name">我是谁？</div>
                    <div class="des">我是王雪</div>
                </div>
            </div>
            <div class="item" style="background-image: url('cg(18).png');">
                <div class="content">
                    <div class="name">我是谁？</div>
                    <div class="des">我是王雪</div>
                </div>
            </div>
            <div class="item" style="background-image: url('cg(20).png');">
                <div class="content">
                    <div class="name">我是谁？</div>
                    <div class="des">我是王雪</div>
                </div>
            </div>
        </div>
        <div class="buttons">
            <div class="s_button" style="background-image: url('https://tonks-blog-1329849192.cos.ap-chengdu.myqcloud.com/AC8B5CA614DA0D9149A48648E1DF96C0.png');"></div>
            <div class="s_button"></div>
        </div>
    </div>
```

#### #css

```css
body{
    background-color: aliceblue;
    overflow: hidden;
}
.container{
    width: 1000px;
    height: 600px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%,-50%);
    background-color: rgba(203, 203, 203, 0);
    padding: 50px;
    box-shadow: 0 30px 50px #bdbdbd00;
    
}
#slide{
    width: max-content;
    margin-top: 50px;

}
.item{
    width: 200px;
    height: 300px;
    background-position: 50%,50%;
    display: inline-block;
    background-size: cover;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    box-shadow: 0 30px 30px #6b6565;
    border-radius: 20px;
    transition: 0.5s;

}
.item:nth-child(1),
.item:nth-child(2){
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* 覆盖一下 */
    transform: translateY(0%);
    box-shadow: 0 0px 0px;

}
.item:nth-child(3){
    left: 70%;
}
.item:nth-child(4){
    left: calc(70% + 220px);/*+-号之前一定要有空格，否则在部分浏览器中不生效*/
}
/* .item:nth-child(n+5){以防万一你有更多图片添加
    left: calc(70% + 220px);
    opacity:0;
} */
.item .content{
    width: 300px;
    position: absolute;
    left: 100px;
    top: 50%;
    transform:translateY(-50%);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    color:aliceblue;
    display:none;
}
.item:nth-child(2) .content{
    display: block;

}
.item .name{
    font-size: 40px;
    font-weight: bold;
    opacity: 0;
    animation: showcontent 1s ease-in-out 0s 1 forwards;

}
.item .des{
    margin: 20px 0;
    opacity: 0;
    animation: showcontent 1s ease-in-out 0.3s 1 forwards;

}
/*css动画部分采用模糊+平移，缩放的部分将由JS完成*/
@keyframes showcontent{
    from{
        opacity: 0;
        transform: translateY(100px);
        filter: blur(20px);
    }to{
        opacity: 1;
        transform: translateY(0);
        filter:blur(0);
    }
}
.buttons{
    width: 100%;
    position: absolute;
    bottom: 50px;
    margin-left: -50px;
    text-align: end;
    /* 对下文的inlineblock生效 */
}
.s_button{
    display: inline-block;
    width: 50px;
    /* 垂直居中 */
    height: 50px;

    background-image: url('https://tonks-blog-1329849192.cos.ap-chengdu.myqcloud.com/8F3B9107EE0C04902D077E400AA09658.png') ;
    background-size: cover;
    opacity: 0.6;
    border: 1px solid #555;
    border-radius: 50%;
    margin: 0 24px;
    transition: 0.5s;
}
.s_button:hover{
    cursor: pointer;
    background-color: #ccc;
}
```

#### #js：其实没有几行代码

```js
    document.querySelectorAll(".s_button")[1].onclick = ()=>{
        let lists=document.querySelectorAll('.item');
        document.querySelector('#slide').appendChild(lists[0])
    }
    document.querySelectorAll(".s_button")[0].onclick = ()=>{
        let lists=document.querySelectorAll('.item');
        document.querySelector('#slide').prepend(lists[lists.length-1])
    }
```

要点：**appendChild识别到了DOM中原本存在的子元素，将其添加到末尾时会自动删去原先的，也就完成了“移动位置”的效果，并不会出现无限叠加的效果。**