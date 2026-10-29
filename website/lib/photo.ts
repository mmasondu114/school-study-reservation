export async function encodePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('请上传JPG或PNG格式照片');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法初始化图片画板');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
  const data = dataUrl.split(',')[1];
  if (data.length > 955732) {
    throw new Error('照片压缩后仍超过700KB，请重新裁剪或选择更小的照片');
  }
  return data;
}
