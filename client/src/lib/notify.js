// Desktop/push notifications via the browser Notification API.

export function initNotifications() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

// Show a notification only when the tab is hidden or the chat isn't focused.
export function showMessageNotification({ title, body, onClick }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/icon.svg', tag: 'chatapp-message' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
