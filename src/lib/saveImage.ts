/** Tải ảnh về dạng File để lưu; null nếu lỗi mạng/CORS. */
export async function fetchImageFile(url: string, name: string, signal?: AbortSignal): Promise<File | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
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
