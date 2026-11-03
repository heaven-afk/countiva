// One geometry and colour source for interface, browser and install icons.
export const brandPath = "M77 23 A38.2 38.2 0 1 0 77 77";
export const brandColours = {
  light: ["#292929", "#292929", "#292929"],
  dark: ["#eeede9", "#eeede9", "#eeede9"],
};
export function brandSvg({
  dark = false,
  adaptive = false,
  tile = false,
} = {}) {
  const colours = dark ? brandColours.dark : brandColours.light;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${adaptive ? `<style>@media(prefers-color-scheme:dark){.s1{stop-color:${brandColours.dark[0]}}.s2{stop-color:${brandColours.dark[1]}}.s3{stop-color:${brandColours.dark[2]}}}</style>` : ""}<defs><linearGradient id="c" x1=".85" y1="0" x2=".15" y2="1"><stop class="s1" stop-color="${colours[0]}"/><stop class="s2" offset=".5" stop-color="${colours[1]}"/><stop class="s3" offset="1" stop-color="${colours[2]}"/></linearGradient></defs>${tile ? '<rect width="100" height="100" fill="#242424"/>' : ""}<g${tile ? ' transform="translate(15 15) scale(.7)"' : ""}><path d="${brandPath}" fill="none" stroke="url(#c)" stroke-width="16"/><circle cx="50" cy="50" r="13" fill="url(#c)"/></g></svg>`;
}
