// utils.js

// --- TOAST NOTIFICATIONS ---
export function showToast(message, type = "success") {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  
  document.body.appendChild(toast);
  
  // Small delay to allow the DOM to register the element before animating
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400); // Wait for CSS transition to finish
  }, 3000);
}

// --- GLOBAL LOADER ---
export function hideGlobalLoader() {
  const loader = document.getElementById('global-loader');
  const layout = document.querySelector('.dashboard-layout');
  
  if (loader) loader.style.opacity = '0';
  if (layout) layout.classList.add('visible');
  
  // Remove loader from DOM after fade out
  setTimeout(() => {
    if (loader) loader.remove();
  }, 400); 
}
