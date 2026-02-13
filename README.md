# Wildcat.chat Platform Homepage

The unified landing page for the Wildcat.chat platform, featuring all Wildcat tools (Sage, WildcatTTS, and Chat Overlay) with consistent branding and modern design.

## Overview

This homepage serves as the main entry point for wildcat.chat, providing:
- Unified Wildcat branding with kaomoji mascot
- Animated static background effect
- 3D floating button design system
- Links to all Wildcat tools with clear navigation
- Mobile-responsive layout

## Features

- **Modern Design**: Clean, accessible design using Atkinson Hyperlegible font
- **3D Buttons**: Skeuomorphic button style with shadows and hover effects
- **Animated Background**: TV static-style animated canvas background
- **Dark Mode**: Automatic dark mode support based on system preferences
- **Responsive**: Mobile-first responsive design
- **Fast Loading**: Optimized assets with caching headers

## Project Structure

```
wildcat-home/
├── firebase.json          # Firebase hosting configuration
├── .firebaserc           # Firebase project settings
├── .gitignore            # Git ignore patterns
├── README.md             # This file
└── public/
    ├── index.html        # Main homepage
    ├── styles/
    │   ├── reset.css     # CSS reset/normalize
    │   ├── unified.css   # Core unified styles
    │   ├── components.css # Component styles
    │   └── home.css      # Homepage-specific styles
    └── scripts/
        ├── static-background.js  # Animated background
        └── navigation.js         # Navigation toggle
```

## Setup

### Prerequisites

- Node.js and npm installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- A Firebase project created

### Installation

1. **Clone or navigate to the repository:**
   ```bash
   cd /path/to/wildcat-home
   ```

2. **Login to Firebase:**
   ```bash
   firebase login
   ```

3. **Configure Firebase project:**
   ```bash
   firebase use --add
   ```
   Select your Firebase project and give it an alias (e.g., "production")

4. **Update `.firebaserc`:**
   Edit `.firebaserc` to use your project ID:
   ```json
   {
     "projects": {
       "default": "your-firebase-project-id"
     }
   }
   ```

## Deployment

### Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

This will deploy the `public/` directory to Firebase Hosting.

### Preview Before Deploying

```bash
firebase serve
```

Then visit `http://localhost:5000` to preview the site locally.

## Development

### Local Development

Simply open `public/index.html` in a web browser, or use a local server:

```bash
# Using Python 3
cd public
python -m http.server 8000

# Using Node.js http-server
npx http-server public -p 8000
```

### Making Changes

- **Styles**: Edit files in `public/styles/`
  - `unified.css` - Core styles shared across all Wildcat properties
  - `components.css` - Reusable component styles
  - `home.css` - Homepage-specific overrides

- **Content**: Edit `public/index.html`
  - Update links, text, feature descriptions
  - Modify hero section, features grid, or resources

- **Scripts**: Edit files in `public/scripts/`
  - `static-background.js` - Animated background configuration
  - `navigation.js` - Mobile menu toggle

## Design System

### Colors

- **Light Mode**: White background, black text, black borders
- **Dark Mode**: Dark background, white text, white borders
- **Accent**: Twitch purple (#9146FF, #772CE8)

### Typography

- **Primary Font**: Atkinson Hyperlegible Next
- **Accent Font**: Cabin Condensed
- **Scale**: 5rem (huge), 3rem (large), 1.5rem (medium), 1rem (regular), 0.875rem (small)

### 3D Button Effect

```css
/* Default state */
border: 2px solid;
box-shadow: 4px 4px 0;

/* Hover state */
transform: translate(-2px, -2px);
box-shadow: 6px 6px 1px rgba(0, 0, 0, 0.6);

/* Active state */
transform: translate(2px, 2px);
box-shadow: 1px 1px 0;
```

### Spacing

- `--spacing-unit`: 8px
- `--spacing-medium`: 24px
- `--spacing-large`: 64px

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- CSS/JS caching: 1 hour (3600s)
- Images caching: 2 hours (7200s)
- Canvas animation optimized with frame rate limiting
- Respects `prefers-reduced-motion` for accessibility

## Related Projects

- **Sage**: AI-powered Twitch chatbot - [app.wildcat.chat](https://app.wildcat.chat)
- **WildcatTTS**: TTS bot for Twitch - [tts.wildcat.chat](https://tts.wildcat.chat)
- **Chat Overlay**: AI-themed chat overlay - [GitHub](https://github.com/detekoi/compact-chat-overlay)
- **Documentation**: [docs.wildcat.chat](https://docs.wildcat.chat)

## License

All rights reserved © 2026 Wildcat.chat

## Support

For questions or support, visit [https://detekoi.github.io/#contact-me](https://detekoi.github.io/#contact-me)

