/** Vẽ SVG ra canvas rồi xuất PNG (SVG của VietQR nhúng sẵn ảnh PNG dạng data URI nên không bị taint). */
async function svgToPngBlob(svg: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 540;
    const h = img.naturalHeight || 640;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Tải ảnh về dạng File PNG để lưu; null nếu lỗi mạng/CORS.
 * `url` phải trỏ thẳng tới ảnh: img.vietqr.io chuyển .png → .svg bằng 301 không kèm header CORS nên fetch .png bị chặn.
 */
export async function fetchImageFile(url: string, name: string, signal?: AbortSignal): Promise<File | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    let blob = await res.blob();
    if (blob.type.includes('svg')) {
      const png = await svgToPngBlob(blob);
      if (!png) return null;
      blob = png;
    }
    return new File([blob], name, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
}

/**
 * Lưu ảnh về máy. `viaShare`: mở bảng chia sẻ (iOS cần cách này để có "Lưu hình ảnh" vào Ảnh);
 * ngược lại tải thẳng bằng thẻ <a download>.
 */
export async function saveImageFile(file: File, viaShare: boolean): Promise<'ok' | 'cancel' | 'fail'> {
  if (viaShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'ok';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancel';
      // các lỗi khác (webview chặn share): thử tải thẳng bên dưới
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return 'ok';
  } catch {
    return 'fail';
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
