// Project data configuration file
// Used to manage data for the project display page

export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: "web" | "mobile" | "desktop" | "other";
	techStack: string[];
	status: "completed" | "in-progress" | "planned";
	liveDemo?: string;
	sourceCode?: string;
	// 可选的额外字段：
	award?: string; // 项目获奖信息，例如 "区域赛三等奖"
	links?: string[] | string; // 可预览链接或多个链接
	demoUrl?: string; // 备用预览字段
	sourceUrl?: string; // 备用源码字段
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
}

export const projectsData: Project[] = [
	{
		id: "mizuki-blog",
		title: "个人博客",
		description:
			"Modern blog theme developed based on the Astro framework, supporting multilingual, dark mode, and responsive design features.",
		image: "",
		category: "web",
		techStack: ["Astro", "TypeScript", "Tailwind CSS", "Svelte"],
		status: "completed",
		liveDemo: "https://blog.example.com",
		sourceCode: "https://github.com/example/mizuki",
		startDate: "2024-01-01",
		endDate: "2024-06-01",
		featured: true,
		tags: ["Blog", "Theme", "Open Source"],
	},
	{
		id: "portfolio-website",
		title: "Personal Portfolio",
		description:
			"Personal portfolio website showcasing project experience and technical skills.",
		image: "",
		category: "web",
		techStack: ["React", "Next.js", "TypeScript", "Framer Motion"],
		status: "completed",
		liveDemo: "https://portfolio.example.com",
		sourceCode: "https://github.com/example/portfolio",
		startDate: "2023-09-01",
		endDate: "2023-12-01",
		featured: true,
		tags: ["Portfolio", "React", "Animation"],
	},
	{
		id: "task-manager-app",
		title: "Task Manager App",
		description:
			"Cross-platform task management application supporting team collaboration and project management.",
		image: "",
		category: "mobile",
		techStack: ["React Native", "TypeScript", "Redux", "Firebase"],
		status: "in-progress",
		startDate: "2024-03-01",
		tags: ["Mobile", "Productivity", "Team Collaboration"],
	},
	{
		id: "data-visualization-tool",
		title: "Data Visualization Tool",
		description:
			"Data visualization tool supporting multiple chart types and interactive analysis.",
		image: "",
		category: "web",
		techStack: ["Vue.js", "D3.js", "TypeScript", "Node.js"],
		status: "completed",
		liveDemo: "https://dataviz.example.com",
		startDate: "2023-06-01",
		endDate: "2023-11-01",
		tags: ["Data Visualization", "Analytics", "Charts"],
	},
	{
		id: "e-commerce-platform",
		title: "E-commerce Platform",
		description:
			"Full-stack e-commerce platform including user management, product management, and order processing features.",
		image: "",
		category: "web",
		techStack: ["Next.js", "Node.js", "PostgreSQL", "Stripe"],
		status: "planned",
		startDate: "2024-07-01",
		tags: ["E-commerce", "Full Stack", "Payment Integration"],
	},
];

// Try to load external projects.json (in public/data) at build/runtime. Fallback to embedded projectsData.
import fs from "node:fs";
import path from "node:path";

const loadExternalProjects = (): Project[] => {
	try {
		const filePath = path.join(
			process.cwd(),
			"public",
			"data",
			"projects.json",
		);
		if (!fs.existsSync(filePath)) return projectsData;
		const raw = fs.readFileSync(filePath, "utf8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed as Project[];
		return projectsData;
	} catch (_err) {
		// If anything goes wrong, fallback to embedded data
		return projectsData;
	}
};

// Get project statistics
export const getProjectStats = () => {
	const data = loadExternalProjects();
	const total = data.length;
	const completed = data.filter((p) => p.status === "completed").length;
	const inProgress = data.filter((p) => p.status === "in-progress").length;
	const planned = data.filter((p) => p.status === "planned").length;

	return {
		total,
		byStatus: {
			completed,
			inProgress,
			planned,
		},
	};
};

// Get projects by category
export const getProjectsByCategory = (category?: string) => {
	const data = loadExternalProjects();
	if (!category || category === "all") {
		return data;
	}
	return data.filter((p) => p.category === category);
};

// Get featured projects
export const getFeaturedProjects = () => {
	const data = loadExternalProjects();
	return data.filter((p) => p.featured);
};

// Get all tech stacks
export const getAllTechStack = () => {
	const data = loadExternalProjects();
	const techSet = new Set<string>();
	for (const project of data) {
		const stack = project.techStack || [];
		for (const tech of stack) {
			techSet.add(tech);
		}
	}
	return Array.from(techSet).sort();
};
