// Only small raster data is stored in this local demo; no external image URLs.
export const MAX_CHAT_IMAGE_CHARS=260000;
export const MAX_CHAT_IMAGE_TOTAL=1600000;
export function chatImage(value){
  if(!value||typeof value.src!=='string'||value.src.length>MAX_CHAT_IMAGE_CHARS||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.src))return null;
  if(!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||value.width>1600||value.height>1600)return null;
  return {src:value.src,width:value.width,height:value.height,...(value.sample===true?{sample:true}:{})};
}
export function messageContent(payload){
  const text=String(payload.text||'').trim(),image=payload.image?chatImage(payload.image):null;
  if(text.length>200)throw new Error('消息不能超过200字');
  if(payload.image&&!image)throw new Error('图片格式或大小不正确，请重新选择照片');
  if(!text&&!image)throw new Error('请填写消息或选择一张图片');
  return {text,...(image?{image}:{})};
}
export async function prepareChatImage(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if(file.size>12*1024*1024)throw new Error('图片超过12MB，请选一张较小的照片');
  const bitmap=await createImageBitmap(file);
  try{
    let factor=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    for(let i=0;i<8;i++){
      canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const src=canvas.toDataURL('image/jpeg',Math.max(.5,.82-i*.045));
      if(src.length<=MAX_CHAT_IMAGE_CHARS)return {src,width:canvas.width,height:canvas.height};
      factor*=.8;
    }
    throw new Error('图片仍然过大，请换一张照片');
  }finally{bitmap.close();}
}
