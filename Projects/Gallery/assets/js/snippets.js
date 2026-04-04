/* =========================================================================
   Snippet preloader (first KB of prompt text for search)
   ========================================================================= */
import { isMobile } from './utils.js';
import { loadPromptText } from './transforms.js';

export async function preloadSnippets(list){
  let work = list;
  if (isMobile) work = list.slice(0, 24);
  const BATCH = 20;
  for (let i = 0; i < work.length; i += BATCH){
    const slice = work.slice(i, i + BATCH);
    await Promise.all(slice.map(async (p) => {
      try { p._snippet = (await loadPromptText(p)).toString().slice(0, 2000); }
      catch { p._snippet = ''; }
    }));
    await new Promise(r => setTimeout(r, 0));
  }
}
