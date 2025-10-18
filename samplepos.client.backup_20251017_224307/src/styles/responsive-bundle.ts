// This file safely imports all the responsive CSS files
// By putting them in a single file, we can ensure they are loaded in the correct order
// and avoid any potential circular dependencies

// Base responsive utilities
import './responsive-utils.css';

// Responsive typography
import './typography-responsive.css';

// Touch friendly utilities
import './touch-friendly.css'; 

// Mobile form components
import './mobile-forms.css';

// Dark mode support
import './dark-mode.css';

// Device orientation support
import './orientation.css';

// Initialize theme based on user preference
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Check for stored theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Use system preference as fallback
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Add class to body to indicate responsive styles are loaded
    document.body.classList.add('responsive-ready');
    
    console.log('Responsive styles initialized successfully');
  } catch (error) {
    console.error('Error initializing responsive styles:', error);
  }
});