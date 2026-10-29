/**
 * Where the game's own static files are (`public/games/drive/`), with a trailing slash.
 * The build's base is relative ('./', from this page's folder); the dev server's is the
 * site root, so there the game's folder has to be added.
 */
export const ASSETS = import.meta.env.DEV ? `${import.meta.env.BASE_URL}games/drive/` : import.meta.env.BASE_URL;
