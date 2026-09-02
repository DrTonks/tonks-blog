export interface Photo {
	id: string;
	src: string;
	thumbnail?: string;
	alt: string;
	title?: string;
	description?: string;
	tags: string[];
	date: string;
	location?: string;
	width?: number;
	height?: number;
	camera?: string;
	lens?: string;
	settings?: string;
}

export type AlbumLayout = "grid" | "masonry" | "surround";

export interface AlbumGroup {
	id: string;
	title: string;
	description: string;
	cover: string;
	date: string;
	location: string;
	tags: string[];
	layout: AlbumLayout;
	columns: number;
	photos: Photo[];
}
