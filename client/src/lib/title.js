import { useEffect } from 'react';

export const APP_TITLE = 'Sameta · Textile mill operations';

/** the browser tab title: "Orders · Sameta"; the app title until the page knows its name */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = typeof title === 'string' && title.trim() ? `${title} · Sameta` : APP_TITLE;
  }, [title]);
}
