// Type declarations for packages whose types VS Code language server
// doesn't auto-resolve from their bundled typings.

declare module "html2canvas-pro" {
  type Options = {
    allowTaint?: boolean;
    backgroundColor?: string | null;
    canvas?: HTMLCanvasElement | null;
    foreignObjectRendering?: boolean;
    imageTimeout?: number;
    ignoreElements?: (element: Element) => boolean;
    logging?: boolean;
    onclone?: (document: Document, element: HTMLElement) => void;
    proxy?: string | null;
    removeContainer?: boolean;
    scale?: number;
    useCORS?: boolean;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    scrollX?: number;
    scrollY?: number;
    windowWidth?: number;
    windowHeight?: number;
  };
  function html2canvas(element: HTMLElement, options?: Options): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
