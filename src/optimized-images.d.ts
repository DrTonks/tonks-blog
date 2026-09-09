declare module 'virtual:optimized-images' {
  const manifest: Record<string, { original: string; thumbnail: string; display: string }>;
  export default manifest;
}
