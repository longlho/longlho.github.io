/// <reference types="vite/client" />

declare module "*.css" {}

declare module "mermaid/dist/mermaid.min.js?url" {
  const url: string;
  export default url;
}
