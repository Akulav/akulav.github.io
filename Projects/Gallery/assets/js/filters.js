(function () {
  const { state } = PV;

  function applyFilters(){
    const q = (state.q || '').trim().toLowerCase();
    let list = state.all;

    if (q) {
      list = list.filter(p => {
        const hay = ((p.title || '') + ' ' + (p._snippet || '')).toLowerCase();
        return hay.includes(q);
      });
    }

    if (state.sel.size) {
      list = list.filter(p => {
        return state.mode === 'AND'
          ? [...state.sel].every(t => has.includes(t))
          : [...state.sel].some(t => has.includes(t));
      });
    }

    if (state.onlyFavs) list = list.filter(p => p.favorite);

    state._lastRenderedItems = list;
    PV.renderGrid(list);
    PV.equalizeCardHeights();
  }

  // make callable from other modules
  window.__pv_applyFilters = applyFilters;
  PV.applyFilters = applyFilters;
})();
