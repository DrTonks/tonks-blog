export type HomeStickerDefinition = {
	id: string;
	kind: "photo" | "blueprint" | "identity" | "index";
	eyebrow: string;
	title: string;
	note: string;
	href: string;
	tilt: number;
	external?: boolean;
	/** 单张图片直接填写 image；同一贴纸随机图片可填写 images。 */
	image?: string;
	images?: string[];
	/** 自动读取 public/data/projects.json 中 status 为 in-progress 的项目封面。 */
	imageSource?: "in-progress-projects";
};

/**
 * 主页 Banner 贴纸配置。
 *
 * 修改文字或链接：编辑对应对象的 title、note、href。
 * 修改贴图：使用 image；需要随机贴图时改用 images 数组。
 * 新增贴纸：复制任意对象并保证 id 唯一即可。
 */
export const homeStickerDefinitions: HomeStickerDefinition[] = [
	{
		id: "album-wuxi",
		kind: "photo",
		eyebrow: "RECENT / ALBUM",
		title: "最新动态",
		note: "无锡的三日留影",
		image: "/images/albums/20260821wuxi/cover.jpg",
		href: "/albums/20260821wuxi/",
		tilt: -3.2,
	},
	{
		id: "project-in-progress",
		kind: "blueprint",
		eyebrow: "WORKBENCH / NOW",
		title: "正在施工",
		note: "最近在做什么项目？",
		image: "/images/projects/personalWebsite.png",
		imageSource: "in-progress-projects",
		href: "/projects/",
		tilt: 2.4,
	},
	{
		id: "personal-home",
		kind: "photo",
		eyebrow: "NOW / TONKS.TOP",
		title: "我的近况？",
		note: "逛逛我的主页",
		image: "/images/projects/tape-tonks.png",
		href: "https://tonks.top/",
		external: true,
		tilt: -2.7,
	},
	{
		id: "timeline-wuxi",
		kind: "photo",
		eyebrow: "MEMORY / 2026",
		title: "时间留影",
		note: "想坐时光机回到过去",
		image: "/images/projects/fc2026-wuxi1.png",
		href: "/timeline/",
		tilt: 3.5,
	},
	{
		id: "about-site",
		kind: "identity",
		eyebrow: "FILE / ABOUT",
		title: "关于本站",
		note: "网站的前世今生",
		image: "/assets/desktop-banner/d5.png",
		href: "/about/",
		tilt: -2.1,
	},
	{
		id: "archive-random",
		kind: "index",
		eyebrow: "INDEX / ARCHIVE",
		title: "翻翻归档",
		note: "我可以听见文字的回声",
		image: "/images/projects/myblog.png",
		href: "/archive/",
		tilt: 1.8,
	},
	{
		id: "friend-link",
		kind: "index",
		eyebrow: "INDEX / FRIEND",
		title: "友链",
		note: "欢迎留言！",
		image: "/images/projects/friend.png",
		href: "/friends/",
		tilt: 1.1,
	},
	{
		id: "community-chat",
		kind: "photo",
		eyebrow: "MESSAGE / CHAT",
		title: "来聊聊天",
		note: "去 Tonks' Chat 留句话",
		image: "/assets/home/home.png",
		href: "https://tonks.top/?open=community",
		external: true,
		tilt: -1.6,
	},
];
