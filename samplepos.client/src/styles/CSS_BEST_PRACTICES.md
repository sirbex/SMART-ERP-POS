# CSS Best Practices Guide

## Using Our CSS Variables System

Our application uses CSS variables (custom properties) to maintain consistent styling across components. Follow these guidelines when developing new features or updating existing ones.

## Core Principles

1. **Use Variables for Design Tokens**
   - Always use CSS variables for colors, spacing, typography, etc.
   - Never hardcode values that should be consistent across the application

2. **Follow the Established Component Structure**
   - Keep component-specific styles in their own CSS files
   - Use semantic class names that describe purpose, not appearance

3. **Maintain Accessibility**
   - Ensure sufficient color contrast
   - Use relative units (rem) for text sizing to respect user preferences
   - Support keyboard navigation and focus styles

## Variable Usage Examples

### Colors

```css
/* Good */
.my-component {
  color: var(--text-color);
  background-color: var(--color-surface);
  border-color: var(--color-primary);
}

/* Avoid */
.my-component {
  color: #333333;
  background-color: white;
  border-color: blue;
}
```

### Spacing

```css
/* Good */
.my-component {
  margin: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
}

/* Avoid */
.my-component {
  margin: 16px;
  padding: 8px 24px;
}
```

### Typography

```css
/* Good */
.my-component {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

/* Avoid */
.my-component {
  font-size: 18px;
  font-weight: 600;
}
```

### Shadows & Borders

```css
/* Good */
.my-component {
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
}

/* Avoid */
.my-component {
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

## Component Structure

Structure your component CSS like this:

```css
/* Component base */
.component {
  /* Base styles using variables */
}

/* Component parts */
.component-header {
  /* Styles for component parts */
}

.component-body {
  /* Styles for component parts */
}

/* Component states */
.component.is-active {
  /* State-specific styles */
}

.component.is-disabled {
  /* State-specific styles */
}

/* Media queries at the end */
@media (max-width: var(--breakpoint-md)) {
  .component {
    /* Responsive adjustments */
  }
}
```

## Adding New CSS Variables

If you need a new variable:

1. Determine if it's a global design token or component-specific
2. For global tokens, add it to variables.css in the appropriate section
3. For component-specific tokens, consider if it should be promoted to a global token
4. Use a descriptive, semantic name that describes purpose rather than value

## Testing CSS Changes

After making CSS changes:

1. Test across multiple browsers (Chrome, Firefox, Safari, Edge)
2. Test at various screen sizes using responsive design mode
3. Verify that high contrast mode and other accessibility features work
4. Check that print styles are appropriate if applicable

By following these guidelines, we'll maintain a consistent, maintainable CSS architecture that scales as our application grows.