
(function(){
  const state = (window.PV && PV.state) ? PV.state : (PV.state = {});

  async function writeRootFavorites(rootHandle, ids){
    try{
      const fh = await rootHandle.getFileHandle('_favorites.json', {create:true});
      const w  = await fh.createWritable();
      const doc = { version: 1, updated: new Date().toISOString(), count: ids.length, ids };
      await w.write(new Blob([JSON.stringify(doc, null, 2)], {type:'application/json'}));
      await w.close();
    }catch(e){
      console.warn('writeRootFavorites failed:', e);
    }
  }

  PV.syncFavoritesToDisk = async function(){
    try{
      if (!state?.rw || !state?.rootHandle) return;
      const all = Array.isArray(state.all) ? state.all : [];
      const ids = all.filter(p => p && p.id && (p.favorite || (PV.FavStore && PV.FavStore.has(p.id)))).map(p => p.id);
      await writeRootFavorites(state.rootHandle, ids);
    }catch(e){
      console.warn('syncFavoritesToDisk failed:', e);
    }
  };
})();
