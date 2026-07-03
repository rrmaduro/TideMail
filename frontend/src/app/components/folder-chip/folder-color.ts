/** Deterministic color from a folder name, so the same folder always looks the same.
 *  Returns a soft tinted background + readable ink derived from a hue hash. */
export interface FolderColor {
  bg: string;
  ink: string;
  dot: string;
}

export function folderColor(name: string): FolderColor {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue} 70% 94%)`,
    ink: `hsl(${hue} 55% 32%)`,
    dot: `hsl(${hue} 65% 50%)`,
  };
}
