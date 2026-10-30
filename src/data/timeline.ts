// Timeline data configuration file
// Used to manage data for the timeline page

interface TimelineItemBase {
	id: string;
	title: string;
	description: string;
	startDate: string;
	endDate?: string; // Missing: ongoing for regular events; a single day for albums.
	location?: string;
	organization?: string;
	position?: string;
	skills?: string[];
	achievements?: string[];
	links?: {
		name: string;
		url: string;
		type: "website" | "certificate" | "project" | "other";
	}[];
	icon?: string; // Iconify icon name
	color?: string;
	featured?: boolean;
	image?: string[];
	albumId?: string; // Optional album sticker for any event type.
}

export type TimelineItem =
	| (TimelineItemBase & { type: "education" | "work" | "project" | "achievement" | "love" })
	| (Omit<TimelineItemBase, "image"> & { type: "album"; albumId: string; image?: never });

export type ResolvedTimelineItem = TimelineItem & {
	album?: { href: string; cover: string; title: string };
};

export const timelineData: TimelineItem[] = [
	{
		id: "2024-07-guangzhou-album",
		type: "album",
		albumId: "20240705guangzhou",
		title: "广东之旅",
		description: "此生仅有的3个月的暑假",
		startDate: "2024-07-03",
		location: "广东 · 广州-深圳",
	},
	{
		"id": "2024-06-highschool-graduation",
		"title": "高中毕业与升学",
		"description": "成为电兵之前...需要隐忍（）",
		"type": "education",
		"startDate": "2024-06-01",
		"endDate": "2024-09-01",
		"location": "福建 福清——四川 成都",
		"organization": "福清一中",
		"position": "雏凤",
		"icon": "material-symbols:school",
		"color": "#2563EB"
	},
	{
		"id": "2024-10-join-miguang",
		"title": "成为微光工作室的一员",
		"albumId": "20241202weiguang",
		"description": "通过笔试与面试，加入电科大信软学院创新工坊名下的微光工作室，成为工作室前端方向的成员。",
		"type": "work",
		"startDate": "2024-10-01",
		"icon": "material-symbols:groups",
		"location": "四川 成都",
		"organization": "微光工作室",
		"position": "前端方向成员",
		"skills": [
			"前端方向"
		],
		"links": [
			{
				"name": "工作室官网",
				"url": "https://glimmer.org.cn/",
				"type": "website"
			}
		],
		"image": [
			"/images/projects/weiguang.png",
			"/images/projects/weiguang2.png"
		],
		"color": "#DC2626"
	},
	{
		"id": "2024-12-autoparts-defect-system",
		"title": "汽车零部件缺陷检测系统开发",
		"description": "参与制作汽车零部件缺陷检测系统，参加第16届全国大学生服务外包创新创业大赛。",
		"type": "project",
		"startDate": "2024-12-01",
		"endDate": "2025-07-01",
		"achievements": [
			"以赛区第九名的成绩获得西部赛区三等奖"
		],
		"icon": "material-symbols:precision-manufacturing",
		"location": "陕西 西安",
		"organization": "微光工作室-glimmer08小组",
		"position": "前端工程师/组长",
		"image": [
			"/images/projects/A08.png",
			"/images/projects/cardetect.png"
		],
		"skills": [
			"ECharts",
			"JavaScript",
			"Element Plus",
			"Vue3"
		],
		"color": "#EA580C"
	},
	{
		"id": "2025-01-16-important-meeting",
		"title": "遇见重要的人",
		"description": "好梦不长。",
		"type": "love",
		"startDate": "2025-01-16",
		"endDate": "2026-05-13",
		"icon": "material-symbols:favorite",
		"location": "四川 成都",
		"color": "#7C3AED"
	},
	{
		"id": "2025-07-miguang-recruit-system",
		"title": "微光工作室招新系统建设",
		"description": "搭建微光工作室招新系统，包括招新网站、提交题目网站与官网的维护，以及负责25级面向大一新生的前端方向招新题。",
		"type": "project",
		"startDate": "2025-07-01",
		"endDate": "2025-09-01",
		"icon": "material-symbols:person-add",
		"organization": "微光工作室",
		"position": "前端方向负责人",
		"image": [
			"/images/projects/weiguangvite.png",
			"/images/projects/weiguangvite2.png"
		],
		"links": [
			{
				"name": "工作室官网",
				"url": "https://glimmer.org.cn/",
				"type": "website"
			}
		],
		"skills": [
			"HTML",
			"JavaScript",
			"TypeScript",
			"Vue3",
			"Tailwind CSS",
			"Pinia",
			"Vitepress"
		],
		"location": "四川 成都",
		"color": "#7C3AED"
	},
	{
		"id": "2025-08-personal-website",
		"title": "个人网站建设计划",
		"description": "搭建个人网站和博客，包括 Sleepy 服务器后端建设、相关状态组件的开发、Astro博客的改造等。",
		"type": "project",
		"startDate": "2025-08-01",
		"icon": "material-symbols:public",
		"location": "四川 成都",
		"skills": [
			"HTML",
			"Vue Bits",
			"TypeScript",
			"Vue3",
			"Tailwind CSS"
		],
		"links": [
			{
				"name": "个人主页",
				"url": "https://tonks.top/",
				"type": "website"
			}
		],
		"image": [
			"/images/projects/personalWebsite.png",
			"/images/projects/myblog.png"
		],
		"color": "#059669"
	},
	{
		id: "2025-08-nanjing-album",
		type: "album",
		albumId: "20250802suzhou",
		title: "闪击江苏",
		description: "太美丽了苏州，我想我在到南京之前都不会忘了你吧",
		startDate: "2025-08-02",
		location: "江苏 · 苏州-南京",
	},
	{
		"id": "2025-09-loan-risk-platform",
		"title": "多数据源贷款及风控平台",
		"description": "应课设要求，搭建多数据源贷款及风控平台，与小组成员商定接口文档、需求分析和设计文档，并初步建设后端和 Web 管理端。",
		"type": "project",
		"startDate": "2025-09-01",
		"icon": "material-symbols:shield",
		"location": "四川 成都",
		"organization": "金融方向互联网+综合设计小组",
		"position": "前端工程师",
		"links": [
			{
				"name": "在线演示",
				"url": "https://loanriskctl-webend.tonks.top/",
				"type": "website"
			}
		],
		"image": [
			"/images/projects/loanriskctl.png",
			"/images/projects/loanrisk.png"
		],
		"color": "#F59E0B"
	},
	{
		"id": "2025-10-uniapp-loan-app",
		"title": "基于 Uniapp 的多数据源贷款 APP ",
		"description": "在管理端之后开始参与基于 Uniapp 的多数据源贷款 APP 的前端开发。",
		"type": "project",
		"startDate": "2025-10-01",
		"icon": "material-symbols:smartphone",
		"location": "四川 成都",
		"organization": "金融方向互联网+综合设计小组",
		"position": "前端工程师",
		"color": "#7F3FBF"
	},
	{
		"id": "2025-10-scholarship-uestc",
		"title": "2024-2025年度电子科技大学信息与软件工程学院二等奖学金",
		"description": "就差一名一等奖...明年别卡我了(╥﹏╥)",
		"type": "achievement",
		"startDate": "2025-09-11",
		"endDate": "2025-10-11",
		"icon": "material-symbols:workspace-premium",
		"location": "四川 成都",
		"organization": "电子科技大学信息与软件工程学院",
		"color": "#bf963f",
		"image": [
			"/images/projects/jxj.jpg"
		]
	},
	{
		"id": "2026-1-pgvector",
		"title": "2025全国大学生计算机系统能力大赛-数据库创新设计赛",
		"description": "完成第2届PolarDB数据库创新设计赛，排位44/3529，进入决赛第二阶段，未入围前20，无缘线下答辩",
		"type": "project",
		"startDate": "2025-11-01",
		"endDate": "2026-01-05",
		"icon": "material-symbols:database",
		"location": "四川 成都",
		"organization": "计系大赛-阿里云天池大赛",
		"position": "混合索引算法优化/组长",
		"links": [
			{
				"name": "源代码",
				"url": "https://gitee.com/DrTonks/polardb_competition_2025",
				"type": "project"
			}
		],
		"skills": [
			"C",
			"SQL",
			"IVF/HNSW",
			"Postgresql"
		],
		"image": [
			"/images/projects/tianchi.png",
			"/images/projects/tianchi2.png"
		],
		"color": "#7C3AED"
	},
	{
		"id": "2026-05-jsj-contest",
		"title": "第19届中国大学生计算机设计大赛四川省省赛",
		"description": "参加第19届中国大学生计算机设计大赛四川省省赛，软件应用与开发类，5月16号完成线上答辩并获奖。",
		"type": "achievement",
		"startDate": "2026-05-01",
		"endDate": "2026-05-16",
		"icon": "material-symbols:emoji-events",
		"location": "四川 成都",
		"organization": "中国大学生计算机设计大赛",
		"achievements": [
			"省二等奖"
		],
		"image": [
			"/images/projects/js2026-1.png"
		],
		"color": "#7C3AED"
	},
	{
		"id": "2026-06-career-planner",
		"title": "第17届中国大学生服务外包创新创业大赛 - 微光职引",
		"albumId": "20260610xian",
		"description": "参加第17届服创大赛【A13】赛题，开发基于AI的大学生职业规划智能体「微光职引」，获西部赛区一等奖并晋级国赛。",
		"type": "achievement",
		"startDate": "2026-06-01",
		"endDate": "2026-07-01",
		"icon": "material-symbols:emoji-events",
		"location": "四川 成都——陕西 西安",
		"organization": "中国大学生服务外包创新创业大赛 · 西部赛区",
		"position": "【A13】基于AI的大学生职业规划智能体",
		"links": [
			{
				"name": "智能体核心源码",
				"url": "https://github.com/DrTonks/career-agent-lab",
				"type": "project"
			},
			{
				"name": "在线演示",
				"url": "https://career-planner.tonks.top/",
				"type": "website"
			}
		],
		"achievements": [
			"西部赛区一等奖"
		],
		"image": [
			"/images/projects/fc2026-1.jpg",
			"/images/projects/fc2026-2.jpg"
		],
		"skills": [
			"Typescript",
			"Agent",
			"LLM"
		],
		"color": "#EA580C"
	},
	{
		"id": "2026-08-dstui",
		"title": "参与开发Deepseek Harness-TUI的问卷设计与渲染工作",
		"description": "设计窗口化通用问卷的长选项列表，让长帮助菜单可滚动并隔离组合键状态",
		"type": "project",
		"startDate": "2026-08-17",
		"endDate": "2026-09-17",
		"icon": "material-symbols:terminal",
		"location": "福建 福州",
		"links": [
			{
				"name": "贡献提交1",
				"url": "https://github.com/ccch1mneyyy/dsh-TUI/commit/eada29576ed8f74f98042ff6286048d84d9d9581",
				"type": "project"
			},
			{
				"name": "贡献提交2",
				"url": "https://github.com/ccch1mneyyy/dsh-TUI/commit/58383cd8176a7ea913da7244802960156a9e2451",
				"type": "project"
			}
		],
		"image": [
			"/images/projects/dstui1.png",
			"/images/projects/dstui2.png"
		],
		"skills": [
			"Typescript",
			"React",
			"Tailwind CSS"
		],
		"color": "#059669"
	},
	{
		"id": "2026-08-career-planner-wuxi",
		"albumId": "20260821wuxi",
		"title": "第17届中国大学生服创大赛全国总决赛",
		"description": "前往江苏·无锡参加为期三天的全国总决赛，获国家级二等奖。",
		"type": "achievement",
		"startDate": "2026-08-20",
		"endDate": "2026-08-22",
		"icon": "material-symbols:emoji-events",
		"location": "江苏 无锡",
		"organization": "中国大学生服务外包创新创业大赛 · 无锡总决赛",
		"position": "【A13】基于AI的大学生职业规划智能体",
		"achievements": [
			"国家级二等奖"
		],
		"image": [
			"/images/projects/fc2026-wuxi1.png",
			"/images/projects/fc2026-wuxi2.png"
		],
		"skills": [
			"Typescript",
			"Agent",
			"LLM"
		],
		"color": "#7C3AED"
	},
	{
		"id": "2026-09-scholarship-uestc",
		"title": "2025-2026年度电子科技大学信息与软件工程学院一等奖学金",
		"description": "多500块钱",
		"type": "achievement",
		"startDate": "2026-09-11",
		"endDate": "2026-10-14",
		"icon": "material-symbols:workspace-premium",
		"location": "四川 成都",
		"organization": "电子科技大学信息与软件工程学院",
		"color": "#bf963f",
		"image": [
			"/images/projects/jxj2.png"
		]
	},
	{
		"id": "2026-10-aiinfor",
		"title": "2026电子科技大学AI+信息素养大赛-校赛二等奖",
		"description": "AI正在摧毁大部分形式的软件学科竞赛（虽说是野鸡比赛，但这也太野了）",
		"type": "achievement",
		"startDate": "2026-09-19",
		"endDate": "2026-10-11",
		"icon": "material-symbols:emoji-events",
		"location": "四川 成都",
		"organization": "电子科技大学信息与软件工程学院",
		"color": "#F59E0B",
		"image": [
			"/images/projects/xiaosaiAI.jpg"
		]
	},
];

// Get timeline statistics
export const getTimelineStats = () => {
	const total = timelineData.length;
	const byType = {
		album: timelineData.filter((item) => item.type === "album").length,
		love: timelineData.filter((item) => item.type === "love").length,
		education: timelineData.filter((item) => item.type === "education").length,
		work: timelineData.filter((item) => item.type === "work").length,
		project: timelineData.filter((item) => item.type === "project").length,
		achievement: timelineData.filter((item) => item.type === "achievement")
			.length,
	};

	return { total, byType };
};

// Get timeline items by type
export const getTimelineByType = (type?: string) => {
	if (!type || type === "all") {
		return timelineData.slice().sort(
			(a, b) =>
				new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
		);
	}
	return timelineData
		.filter((item) => item.type === type)
		.sort(
			(a, b) =>
				new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
		);
};

// Get featured timeline items
export const getFeaturedTimeline = () => {
	return timelineData
		.filter((item) => item.featured)
		.sort(
			(a, b) =>
				new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
		);
};

// Get current ongoing items
export const getCurrentItems = () => {
	return timelineData.filter((item) => item.type !== "album" && !item.endDate);
};

// Calculate total work experience
export const getTotalWorkExperience = () => {
	const workItems = timelineData.filter((item) => item.type === "work");
	let totalMonths = 0;

	workItems.forEach((item) => {
		const startDate = new Date(item.startDate);
		const endDate = item.endDate ? new Date(item.endDate) : new Date();
		const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
		const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
		totalMonths += diffMonths;
	});

	return {
		years: Math.floor(totalMonths / 12),
		months: totalMonths % 12,
	};
};
