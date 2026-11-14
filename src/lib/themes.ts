/**
 * Theme registry. Colour tokens live in globals.css under [data-theme="…"];
 * this file holds the metadata and the photographer credit for each theme.
 *
 * Originals go in assets/themes/<id>.jpg; `npm run themes` builds the
 * web versions into public/themes/.
 */

export type ThemeId = "summit" | "pass" | "dusk";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  tone: "bright" | "mid" | "dark";
  /** Swatch for the picker: sky → ground, taken from the photo. */
  swatch: string;
  credit: {
    photographer: string;
    profileUrl: string;
    photoUrl: string;
  };
}

const ref = "?utm_source=sudoku_portfolio&utm_medium=referral";

export const THEMES: ThemeInfo[] = [
  {
    id: "summit",
    name: "Summit",
    tone: "bright",
    swatch: "linear-gradient(160deg, #85a5b5 0%, #dcd8d2 45%, #b0862f 100%)",
    credit: {
      photographer: "Rafael Peier",
      profileUrl: `https://unsplash.com/@rafaelpeier${ref}`,
      photoUrl: `https://unsplash.com/photos/majestic-mountain-landscape-with-a-winding-road-at-sunset-cjAI-0kMDC0${ref}`,
    },
  },
  {
    id: "pass",
    name: "Pass",
    tone: "mid",
    swatch: "linear-gradient(160deg, #6f8ea9 0%, #96b2c8 45%, #a0561f 100%)",
    credit: {
      photographer: "Sarmat Batagov",
      profileUrl: `https://unsplash.com/@batag_${ref}`,
      photoUrl: `https://unsplash.com/photos/rocky-mountain-peak-in-golden-light-cG4_rUVyW7c${ref}`,
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    tone: "dark",
    swatch: "linear-gradient(160deg, #5a6262 0%, #987459 50%, #211f1b 100%)",
    credit: {
      photographer: "Filip Zrnzević",
      profileUrl: `https://unsplash.com/@filipz${ref}`,
      photoUrl: `https://unsplash.com/photos/a-mountain-with-a-road-going-through-it-tj2uU85m_q4${ref}`,
    },
  },
];

export const DEFAULT_THEME: ThemeId = "summit";

export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
