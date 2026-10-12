import { render } from 'preact';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);

// iOS Safari bỏ qua user-scalable=no; cử chỉ pinch của WebKit chỉ chặn được qua sự kiện này.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Service worker chỉ có trong bản build (plugin `service-worker` trong vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Đăng ký lỗi (webview không hỗ trợ, chế độ riêng tư) không ảnh hưởng chức năng chính.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
