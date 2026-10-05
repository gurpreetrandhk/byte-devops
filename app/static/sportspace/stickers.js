// One local catalog powers the login preview and private sticker messages.
window.RingStickers={items:[],image(id){return this.items.find(sticker=>sticker.id===id);}};
const stickerCatalogURL=new URL('stickers.json',document.currentScript.src);
RingStickers.ready=fetch(stickerCatalogURL.href).then(response=>{
  if(!response.ok)throw new Error('Could not load stickers.');
  return response.json();
}).then(catalog=>{
  RingStickers.items=catalog.stickers;
  return RingStickers.items;
}).catch(()=>[]);
