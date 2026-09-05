---
title: 前端笔记(一) · ECMAScript
published: 2024-10-01
description: 对ES6与ES7等语法规范的学习
tags:
  - Markdown
  - ES6
  - JavaScript
  - 前端
  - 学习
category: 学习笔记
draft: false
---

只是备忘录（当然根本记不住这么多特性......）。偶尔拿出来看一眼。

## ECMAScript语法规范01·基础

#### 1.对象：

```js
let boy = {
	name: 'Tonks'，
	age: 18,
	height: 180,
}
console.log(boy)

//对象的 修改 or 添加
boy.height = 175
boy.web = "https://drtonks.github.io/myblog.github.io/"
console.log(boy)

//delete关键字。用法与其他有区别。
delete boy.gender

//has。用法与其他有区别。
let has = "gender" in boy
console.log(has) //-->false

//获取属性key or value
Object.keys(boy)
Object.keys(boy).length
```

遍历循环：
for of用于遍历可迭代对象（数组、字符串、Set、Map...）

所以使用for in（用于遍历对象的可枚举属性）

```js
for(let key in boy){
	console.log("forInKey",key,"value",boy)
}  //value直接对应对象的属性值
```

forEach。区别其他forEach。

```js
Object.entries(boy) //这条语句是个二维数组
Object.entries(boy).forEach(([key,value])=>{
	console.log("key",key,"v",value)
})
```

清空用替代

```js
boy = {}
```



#### 2.Map操作

```js
let boy = new Map{[
	["name","Tonks"],
	["age","18"]
]}
```

​	本质上是实例化的对象，可通过`console.log(typeof boy)`检查。键值对应唯一。

```js
boy.set("height",180)
console.log(boy) 
boy.delete("name")//删除“名字”和键对应项
console.log(boy) 

console.log(boy.has("name")) //false

//size
console.log(boy.size)  //-->2
```

转化arr方法同set。有区别。

解构：

```js
for(let value of boy){
	console.log("v",value)
}
//解构
for(let [key,value] of boy){
	console.log("k",key,"v",value)
}//键值打印
boy.forEach(value,key)=>{
	console.log("k",key,"value",value)
}//顺序不能错，forEach先找value再找key
```

清空用clear()。

#### 3.Set操作（无序集合）

```
let age = new set{1,2,3,2,1}
```

```
console.log(age)
```



```
add/delete:加上/删去指定元素
has：判断是否元素在其中，返回布尔值
```

扩展运算符：...用于展开可迭代参数

```js
//Array.from()和...扩展运算符有时能有一样的效果
let me = "Dr.Tonks"
let meArr= [...me]
console.log(meArr) //-->["D","r",".","T"...]
//中文同理
//对set也可以使用for of和forEach，但是没有索引--索引是自己。
//集合无序
```

简单去重：

```
let numberArr = [1,2,3,3,2,1]
let numberSet = new Set(numberArr)// -->[1,2,3]
```

清空用clear()。

#### 4.Array数组操作

```js
let arr=[10,11]
console.log("arr",arr)  //-->[10,11]

//push:在结尾添加并且返回数组
let arrLength = arr.push(12,13)
console.log("arr",arr)  //-->[10,11,12,13]
console.log("arrLength",arrLength)  //-->4
//unshift:在开头添加并返回

//shift:删除数组中的第一个元素，并返回被删除函数
let del = arr.shift()
console.log("del",del) //-->10
//pop:删除最后一个

//splice:删除元素，并返回被删除元素
arr.splice(要删除的元素索引位置（从0索引）,要删除的元素数量)

```

排序相关：

```js
//sort
let arr=[1,99,6]
let arr2=["banana","apple","orange"]
arr2.sort //-->["apple","banana","orange"]默认按照首字母
arr.sort( (a,b) => a-b ) //-->[1,6,99],a>b时a排在b后

//filter
let arr3 = [10,11,12,13,14,15]
let newArr=arr3.filter((value,index)=>{
	return value>2
})
console.log("newArr",newArr) //-->[13,14,15]

//concat
let arr4=["a","b"]
let New=arr3.concat(arr4,19,20) //-->[10,11,12,13,14,15,"a","b",19,20]

```

```js
//遍历

//for ...of
let arr5=["gg",100,9]
for(let item//参数 of arr5){
	console.log("for...of",item)
}

//forEach
arr5.forEach(value =>{
	console.log("forEach",value)
})

arr5.forEach((value,index) =>{
	console.log("value",value,"index",index)
})//index索引其数组位置
```



#### 5.函数操作

查询特定url函数：

```js
function getweb(){
	const url = window.location.href;     // 完整的 URL
	
	/*const protocol = window.location.protocol; // 协议
	const hostname = window.location.hostname;//主机名
	const port = window.location.port;        // 端口
	const pathname = window.location.pathname; // 路径
	const search = window.location.search;  // 查询字符串
	const hash = window.location.hash; */       // 锚点

	/*console.log("完整 URL:", url);
	console.log("协议:", protocol);
	console.log("主机名:", hostname);
	console.log("端口:", port);
	console.log("路径:", pathname);
	console.log("查询字符串:", search);
	console.log("锚点:", hash);*/

	return url
}
console.log(getweb())
```

```js
//有参数
function add(number  /*  =10  默认*/  ){
	return number+10
}
//匿名函数
let sub = function(x,y){
	return x-y
}
console.log(sub(20,6)) //-->14
```

重点：

```js
//箭头函数
let plus = (a,b)=>{
	return a+b
}
console.log(plus(20,9)) //-->29

//隐式返回
let plus2 = (a,b)=> a+b

console.log(plus2(20,9)) //-->29
```



#### 6.类 class

用于创建具有相同属性的方法的对象（梦回css）

```js
class Person{
	name
	age
	
	constructor(iname,iage){      //构造函数,iname为传递进来的参数
		this.name = iname
		this.age = iage
	}
	
	info(){						//方法
		console.log("name",this.name,"age",this.age)
	}
	
}
//调用：
let person = new Person("Tonks",18)
person.info()
```

​	console输出结果为：name Tonks age 18

## ECMAScript语法规范02·类/解构

## 类 class

### class 私有属性：

```js
class Person{
	name
	#web
	constructor(name,web){
		this.name= name
		this.#web=web
	}
	info(){
		return "姓名"+this.name+"个人网站"+this.web
	}
}
let person = new Person("Dr.Tonks","https://drtonks.github.io/myblog.github.io/")
console.log(person.web) //输出undefined
```

​	获取私有属性。

```js
class Person{
	name
	#web
	constructor(name,web){
		this.name= name
		this.#web=web
	}
	get web(){
		return this.#web
}
	info(){
		return "姓名"+this.name+"个人网站"+this.web
	}
}
let person = new Person("Dr.Tonks","https://drtonks.github.io/myblog.github.io/")
console.log(person.web) //获取网址
```

​	尽管是私有属性，但是可以被修改。

```js
class Person{
	name
	#web
	constructor(name,web){
		this.name= name
		this.#web=web
	}
	get web(){
		return this.#web
}
	info(){
		return "姓名"+this.name+"个人网站"+this.web
	}
}
let person = new Person("Dr.Tonks","https://drtonks.github.io/myblog.github.io/")
person.web = "www.7k7k.com"
console.log(person.web) //无法获取7k7k网址,仍返回个人博客。

//修改：
class Person{
	name
	#web
	constructor(name,web){
		this.name= name
		this.#web=web
	}
	get web(){
		return this.#web
}
	set web(value){
		this.#web = value
	}
	info(){
		return `姓名:${this.name} 个人网站:${this.web}`
		//模板字符串：即"姓名"+this.name+"个人网站"+this.web，反引号用法类转义
	}
}
let person = new Person("Dr.Tonks","https://drtonks.github.io/myblog.github.io/")
person.web = "www.7k7k.com"
console.log(person.web)  //获取7k7k网址

```

​	即  使用存取器getter和setter获取/设置私有属性

### 类的继承：

​	

```js
//子类：可以有自己的方法 用extends构造
class Tonks extends Person{
	gender
	constructor(name,web,gender){
		super(name,web) //调用父类的构造函数
		this.gender = gender
	}
	eat(){
		return `${this.name}在吃饭`
	}
}
let tonks = new Tonks("Tonks","https://drtonks.github.io/myblog.github.io/","boy")
console.log(Tonks.web)//可调用父类方法/属性
console.log(Tonks.eat())//调用子类方法
console.log(Tonks.gender)//子类属性
```

## 解构

### 数组解构·赋值

```js
let [x,y]=[1,2]
console.log(x,y)
//略过某些元素
let [,,,z,] = [1,3,2,56,7] //-->56

//扩展运算符
let [A,...B]=[1,2,3,4,5,6]
console.log("A",A,"B",B) //分别获取1和[2,3,4,5,6]

//默认
let [x,y]=[1] //y为undefined
let [x,y=200]=[1] //y为200

//两数交换
let x=10,y=20;
let [x,y]=[y,x]
console.log("x=",x,"y=",y)
```

### 对象解构：

```json
let person ={
	name:"Tonks",
	gender:"man!",
	saying:"What can I say"
}
let {name} = person
console.log(name)
//同一模块下，如果下方还使用name会报错。使用重命名：
let {name:username,gender,saying} = person
console.log("name:",name,"gender:",gender,"saying:",saying)
```

