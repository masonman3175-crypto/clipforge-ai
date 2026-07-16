// ffprobe-static ships no types; it exposes the path to the bundled binary.
declare module 'ffprobe-static' {
  export const path: string;
  const _default: { path: string };
  export default _default;
}
