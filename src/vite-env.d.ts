/// <reference types="vite/client" />

declare module "*.css" {}

declare module "mermaid/dist/mermaid.min.js?url" {
  const url: string;
  export default url;
}

declare module "virtual:posts" {
  export type Post = {
    slug: string;
    title: string;
    excerpt: string;
    date: string;
    dateLabel: string;
    html: string;
  };

  export const posts: Post[];
}
