/**
 * Tailwind v4 ships its PostCSS plugin separately. This is the only
 * config needed — there's no `tailwind.config.{js,ts}` anymore;
 * theme tokens live inside `src/app/globals.css` under `@theme {}`.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
