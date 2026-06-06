const ThemeManager = {
  setTheme: (isDark) => {
    if (isDark) {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    }
  },
  getTheme: () => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== 'light'; // Default to dark if not specified
  },
  initTheme: () => {
    const isDarkTheme = ThemeManager.getTheme();
    ThemeManager.setTheme(isDarkTheme);
    return isDarkTheme;
  }
};

export default ThemeManager;
