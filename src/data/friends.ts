export interface FriendLink {
	name: string;
	description: string;
	avatar: string;
	url: string;
	category: string;
	/** Optional RSS/Atom URL; omit for sites without a feed. */
	rss?: string;
	fastener?: "pin" | "tape";
}

export const friendsData: FriendLink[] = [
	{
		"name": "Fuwari",
		"description": "基于 Astro 开发的静态博客模板。",
		"avatar": "https://fuwari.vercel.app/_astro/demo-avatar.CxcI0ivM_1nbuVe.webp",
		"url": "https://fuwari.vercel.app/",
		"category": "Blog",
		"fastener": "pin"
	},
	{
		"name": "伏枥之间",
		"rss": "https://leehenry.top/rss.xml",
		"description": "何妨吟啸且徐行",
		"avatar": "https://leehenry.top/friends/my-avatar-portrait.jpg",
		"url": "https://www.leehenry.top",
		"category": "Star",
		"fastener": "pin"
	},
	{
		"name": "橘鸦Juya",
		"rss": "https://daily.juya.uk/rss.xml",
		"description": "记录人类完蛋全过程 | 每日更新",
		"avatar": "https://i1.hdslb.com/bfs/face/afa12816f678f482a7333289d82437208b8d8cbf.jpg@128w_128h_1c_1s.webp",
		"url": "https://daily.juya.uk/",
		"category": "Juya",
		"fastener": "tape"
	},
	{
		"name": "MmzMing的知识库",
		"rss": "https://tblog.mmzhiku.xyz/rss.xml",
		"description": "哈基米，南北绿豆",
		"avatar": "https://i.stardots.io/784774835/StarDots-2026052116374135506.jpg",
		"url": "https://tblog.mmzhiku.xyz",
		"category": "Blog",
		"fastener": "pin"
	},
	{
		"name": "LQQ",
		"rss": "https://lqq.ai/rss.xml",
		"description": "记录所见，思考未完",
		"avatar": "https://lqq.ai/assets/avatar-128.webp",
		"url": "https://lqq.ai/",
		"category": "Blog",
		"fastener": "tape"
	},
	{
		"name": "时歌的博客",
		"rss": "https://www.lapis.cafe/rss.xml",
		"description": "理解以真实为本，但真实本身并不会自动呈现",
		"avatar": "https://www.lapis.cafe/avatar.webp",
		"url": "https://www.lapis.cafe",
		"category": "Blog",
		"fastener": "pin"
	},
	{
		"name": "莫比乌斯",
		"rss": "https://mobius.blog/feed/",
		"description": "写作，一场自我悖驳的旅程。",
		"avatar": "https://i0.wp.com/mobius.blog/wp-content/uploads/2022/12/MobiusBlogLogo.png?resize=150%2C150&ssl=1",
		"url": "https://mobius.blog/",
		"category": "Star",
		"fastener": "tape"
	},
	{
		"name": "Neuro-sama's Brilliant Blog",
		"rss": "https://blog.neurosama.com/feed.xml",
		"description": "Made with ♥ 99% AI, 1% Something More",
		"avatar": "https://blog.neurosama.com/assets/neuros_blog_logo.png",
		"url": "https://blog.neurosama.com/",
		"category": "Neuro",
		"fastener": "pin"
	}
];
