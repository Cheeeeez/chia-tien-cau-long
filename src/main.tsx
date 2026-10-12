import { render } from 'preact';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);

// Service worker chỉ có trong bản build (plugin `service-worker` trong vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Đăng ký lỗi (webview không hỗ trợ, chế độ riêng tư) không ảnh hưởng chức năng chính.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
